import {branchAndMerge, chain, Rule, SchematicContext, SchematicsException, Tree} from '@angular-devkit/schematics';
import * as fs from 'fs';
import * as ts from 'typescript';
import {Change, InsertChange, RemoveChange, ReplaceChange} from "../schematics-angular-utils/change";
import {Path} from "typescript";
import {findNodes, getSourceNodes} from "../schematics-angular-utils/ast-utils";
import {FbBreaksOptions} from "./fbBreaksOptions";

// Loads the newest version of a source file so that previous writes are not forgotten
function getSourceFile(path: string): ts.SourceFile|undefined {
    let text = fs.readFileSync(path);
    if(!text) return undefined;

    const sourceText = text.toString('utf-8');
    return ts.createSourceFile(
        path,
        sourceText,
        ts.ScriptTarget.Latest,
        true
    );
}

// function findStringInFile(sourceFile: SourceFile, target: string): string {
//     let lines = sourceFile.toString().split('\n');
//     for( let line in lines ) {
//         if(line.search(target) > -1) {
//             return line;
//         }
//     }
//     return '';
// }

function findImportAsName(nodes: ts.Node[], target: string, path: string): string| null {
    let importNodes = nodes.filter(n => {
        return n.kind === ts.SyntaxKind.ImportDeclaration;
    });
    if(!importNodes) return null;
    for(let importNode of importNodes) {
        if(importNode.getFullText().search(target) > -1) {
            let importNameNode = findSuccessor(importNode, [
                ts.SyntaxKind.ImportClause,
                ts.SyntaxKind.NamespaceImport,
                ts.SyntaxKind.Identifier
            ]);
            if(!importNameNode) {
                console.log(`No ${target} import found in ${path}`);
                return null;
            }
            return importNameNode.getText();
        }
    }
    return null;
}

function fixCrashlytics(fbNode: ts.Node, path: string): ReplaceChange|null {
    let eventNode = findSuccessor(fbNode, [ts.SyntaxKind.PropertyAccessExpression, ts.SyntaxKind.Identifier]);
    if(eventNode && eventNode.getText() === 'onNewDetected') {
        return new ReplaceChange(path, eventNode.pos, eventNode.getText(), 'onNew');
    }
    return null;
}

// Returns the trigger type of the event found in sourceNode. Can be database, firestore, auth, crashlytics or storage
function getTriggerType(sourceNode: ts.Node, fbFunctionsImportName: string) {
    let targetNode = findSuccessor(sourceNode, [
        ts.SyntaxKind.PropertyAccessExpression,
        ts.SyntaxKind.CallExpression,
        ts.SyntaxKind.PropertyAccessExpression,
        ts.SyntaxKind.PropertyAccessExpression
    ]);

    // Also check whether the functions import is included in targetNode
    if(!targetNode || targetNode.getText().search(fbFunctionsImportName) === -1) return '';
    return targetNode.getLastToken().getText();
}

function rewriteEvents(path: string): Change[] {
    let changes: Change[] = [];

    // Get the sourcefile, nodes and the name of the firebase-functions import
    const sourceFile = getSourceFile(path);
    if(!sourceFile) {
        throw new SchematicsException(`unknown sourcefile at ${path}`)
    }
    let nodes = getSourceNodes(sourceFile);
    let callNodes = nodes.filter(n => {
        return n.kind === ts.SyntaxKind.CallExpression;
    });
    let fbFunctionsImportName = findImportAsName(nodes, 'firebase-functions', path);
    if(!fbFunctionsImportName) {
        return changes;
    }

    // Find occurrences of the onDelete, onCreate, onUpdate and onWrite functions
    let firebaseFunctionNodes = callNodes.filter(node => node.getText().search(fbFunctionsImportName+'.*onDelete|onCreate|onUpdate|onWrite|onNewDetected|onChange')>-1);
    if(!firebaseFunctionNodes) {
        console.log('No events found in file: ' + path);
        return changes;
    }

    // Iterate over these functions
    for (let fbNode of firebaseFunctionNodes) {
        if(!fbNode.parent) continue;

        const trigger: string = getTriggerType(fbNode, fbFunctionsImportName);
        if(!(
            trigger === 'database' ||
            trigger === 'firestore' ||
            trigger === 'auth' ||
            trigger === 'crashlytics' ||
            trigger === 'storage'
        )) {
            console.log(`${trigger} is not a valid trigger type.`);
            continue;
        }

        // Make sure function has a callback
        let arrowFunctionNode = findSuccessor(fbNode, [
                ts.SyntaxKind.SyntaxList,
                ts.SyntaxKind.ArrowFunction
            ]
        );
        if (!arrowFunctionNode) {
            console.log('No arrowFunctionNode found in file: ' + path);
            continue;
        }

        // Get the parameterlist to rename the event parameter
        let eventParamNode = findSuccessor(arrowFunctionNode, [
                ts.SyntaxKind.SyntaxList,
                ts.SyntaxKind.Parameter,
                ts.SyntaxKind.Identifier
            ]
        );
        if (!eventParamNode) {
            console.log('No eventParamNode found in file: ' + path);
            continue;
        }

        // Rewrite the event parameter. If the parameter list was not already between parentheses, they should be added
        // This can occur when only a single parameter was present
        if(arrowFunctionNode.getChildren().find(n => n.kind == ts.SyntaxKind.OpenParenToken)) {
            changes.push(new ReplaceChange(path, eventParamNode.pos, 'event', 'data, context'));
            console.log('wel parenthesis gevonden');
        }
        else {
            changes.push(new ReplaceChange(path, eventParamNode.pos, 'event', '(data, context)'));
            console.log('geen parenthesis gevonden');
        }

        // onNewDetected event of Crashlytics was renamed to onNew
        if(trigger === 'crashlytics') {
            let change = fixCrashlytics(fbNode, path);
            if (change) changes.push(change);
        }

        // Find the body (=SyntaxList) of the callback
        let eventBlockNode: ts.Node|undefined|null = findSuccessor(arrowFunctionNode, [
                ts.SyntaxKind.Block,
                ts.SyntaxKind.SyntaxList
            ]
        );
        if(!eventBlockNode) continue; // Try next candidate

        // Find usages of the event parameter and rewrite them
        let eventdataCandidates = eventBlockNode.getChildren().filter(n => n.getText().search('event') > -1);
        let prevChange = false;
        for(let candidate of eventdataCandidates) {
            let assignmentCandidates = findNodes(candidate, ts.SyntaxKind.PropertyAccessExpression);

            // Construct the right change object
            for(let assignment of assignmentCandidates) {
                //If parent is a PropertyAccessExpression and was already changed, skip this one
                if(assignment.parent && assignment.parent.kind === ts.SyntaxKind.PropertyAccessExpression && prevChange) {
                    //prevChange = false; //TODO: Misschien moet dit wel
                    continue;
                }
                prevChange = false;

                // If the parameter starts with a space, this should be added to the change object as well.
                let spaceOrNoSpace = '';
                if(assignment.getFullText()[0] === ' ') {
                    spaceOrNoSpace = ' ';
                }

                const nodeText = assignment.getText();

                if(trigger === 'auth' && assignment.getText().search(/lastSignedInAt|createdAt/) > -1) {
                    let identifierNode = assignment.getLastToken();
                    if(identifierNode.kind === ts.SyntaxKind.Identifier) {
                        if(identifierNode.getText() === 'lastSignedInAt') {
                            changes.push(new ReplaceChange(path, identifierNode.pos, identifierNode.getText(), 'lastSignInTime'));
                        }
                        else if(identifierNode.getText() === 'createdAt') {
                            changes.push(new ReplaceChange(path, identifierNode.pos, identifierNode.getText(), 'creationTime'));
                        }

                    }
                }

                // Operation-specific changes
                if(fbNode.getText().search(/onWrite|onUpdate/) > -1
                    && nodeText === 'event.data.data') {
                        changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+nodeText, spaceOrNoSpace+'data.after.data'));
                        prevChange = true;
                } else if(fbNode.getText().search(/onWrite|onUpdate/) > -1
                    && nodeText === 'event.data.val'
                    && (trigger === 'database' || trigger === 'firestore')) {
                        changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+nodeText, spaceOrNoSpace+'data.after.val'));
                        prevChange = true;
                } else if(fbNode.getText().search(/onWrite|onUpdate/) > -1
                    && nodeText === 'event.data.previous.val'
                    && (trigger === 'database' || trigger === 'firestore')) {
                        changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+nodeText, spaceOrNoSpace+'data.before.val'));
                        prevChange = true;
                } else if(fbNode.getText().search(/onDelete/) > -1
                    && nodeText === 'event.data.previous.val'
                    && (trigger === 'database')) {
                        changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+nodeText, spaceOrNoSpace+'data.val'));
                        prevChange = true;
                }

                // Use of deprecated variable
                else if(nodeText === 'event.data.ref.parent'
                    && trigger === 'database') {
                        //changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+'event.data.ref.parent', spaceOrNoSpace+'event.data.ref.parent//TODO DIT IS NIET CORRECT MEER'));
                        throw new SchematicsException(`Use of deprecated variable event.data.ref.parent was found in file ${path}. The use of this statement is too context sensitive so please remove it by hand.`);
                }

                // Simple variable rewriting
                else if(nodeText === 'event.data.adminRef.parent') {
                    changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+nodeText, spaceOrNoSpace+'data.ref.parent'));
                    prevChange = true;
                } else if(nodeText === 'event.data') {
                    changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+nodeText, spaceOrNoSpace+'data'));
                    prevChange = true;
                } else if(nodeText === 'event.params') {
                    changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+nodeText, spaceOrNoSpace+'context.params'));
                    prevChange = true;
                }
            }
        }
    }
    return changes;
}

function rewriteInitializeApp(path: string): Change[] {
    let changes: Change[] = [];

    // Get the sourcefile, nodes and the name of the firebase-functions and firebase-admin imports
    const sourceFile = getSourceFile(path);
    if(!sourceFile) {
        throw new SchematicsException(`unknown sourcefile at ${path}`)
    }
    let nodes = getSourceNodes(sourceFile);
    let fbFunctionsImportName = findImportAsName(nodes, 'firebase-functions', path);
    let fbAdminImportName = findImportAsName(nodes, 'firebase-admin', path);

    let syntaxListNode = nodes.find(n => n.kind === ts.SyntaxKind.SyntaxList);
    if(!syntaxListNode) {
        throw new SchematicsException('No syntaxlist found in ' + path);
    }

    // Remove deprecated use of functions.config().firebase as parameter in admin.initializeApp()
    // First find a use of the initializeApp() function
    let expressionStatementNode = syntaxListNode.getChildren().find(n =>
        n.kind === ts.SyntaxKind.ExpressionStatement &&
        n.getText().search(fbAdminImportName+'.initializeApp') > -1
    );
    if(!expressionStatementNode) {
        console.log('No expressionStatementNode found in ' + path);
        return changes;
    }
    // Now get its function node
    let callExpressionNode = expressionStatementNode.getChildren().find(n => n.kind === ts.SyntaxKind.CallExpression);
    if(!callExpressionNode) {
        console.log('No callExpressionNode found in ' + path);
        return changes;
    }

    // If there is a parameter, it should be removed.
    let parametersNode = callExpressionNode.getChildren().find(n =>n.kind === ts.SyntaxKind.SyntaxList);
    if(!parametersNode) {
        console.log('No parameters node found in ' + path);
        return changes;
    }
    changes.push(new RemoveChange(path, parametersNode.pos, parametersNode.getFullText()));

    let candidates = nodes.filter(n => n.kind===ts.SyntaxKind.PropertyAccessExpression
        && n.getText().search('initializeApp')===-1);
    for(let candidate of candidates) {
        if(candidate.getText() === fbFunctionsImportName+'.config().firebase'){
            // Do not change the initializeApp() function call
            if(candidate.parent && candidate.parent.parent && candidate.parent.parent.getText().search('initializeApp')>-1) {
                continue;
            }
            let spaceOrNoSpace = '';
            if(candidate.getFullText()[0] === ' ') {
                spaceOrNoSpace = ' ';
            }
            changes.push(new ReplaceChange(path, candidate.pos, spaceOrNoSpace+fbFunctionsImportName+'.config().firebase', spaceOrNoSpace+'JSON.parse(process.env.FIREBASE_CONFIG)'));
        }
    }
    return changes;
}

function applyChanges(host: Tree, changes: Change[], path: Path) {
    let changeRecorder = host.beginUpdate(path);
    for(let change of changes ) {
        if (change instanceof InsertChange) {
            console.log('InsertChange. pos: ' + change.pos + ' newtext: ' + change.toAdd);
            changeRecorder.insertLeft(change.pos, change.toAdd);
        }
        // ReplaceChange first removes the old information and then inserts the new information on the same location
        else if (change instanceof ReplaceChange) {
            console.log('ReplaceChange. pos: ' + change.pos + ' oldText: ' + change.oldText + ' newtext: ' + change.newText);
            changeRecorder.remove(change.pos, change.oldText.length);
            changeRecorder.insertLeft(change.pos, change.newText);
        }
        else if (change instanceof RemoveChange) {
            console.log('RemoveChange. pos: ' + change.pos + ' toRemove: ' + change.toRemove);
            changeRecorder.remove(change.pos, change.toRemove.length);
        }
    }
    host.commitUpdate(changeRecorder);
}

// Recursively traverses the syntax tree downward searching for a specific list of nodetypes.
// The function only traverses downward when a match is found.
function findSuccessor(node: ts.Node, searchPath: ts.SyntaxKind[] ) {
    let children = node.getChildren();
    let next: ts.Node | undefined;

    for(let syntaxKind of searchPath) {
        next = children.find(n => n.kind == syntaxKind);
        if (!next) return null;
        children = next.getChildren();
    }
    return next;
}

function findEventNodes(nodes: ts.Node[], fbFunctionsImportName: string, regex?: RegExp): ts.Node[] {
    return nodes.filter(n =>
           n.kind === ts.SyntaxKind.CallExpression
        && n.getText().search(fbFunctionsImportName) > -1
        && (regex === undefined || n.getText().search(regex) > -1)
    );
}

// Traverses upwards through the syntaxtree looking for a parent node of type nodeType.
// If a regex is given, it is also checked whether the parent node's text contains this regular expression.
// This is done using the search() method, so an exact match is not required.
// If no match is found, null is returned.
function findParentNode(node: ts.Node, nodeType: ts.SyntaxKind, regex?: RegExp): ts.Node|null {
    while(node.parent) {
        if(node.parent.kind === nodeType && (!regex || node.parent.getText().search(regex) > -1)) {
            return node.parent;
        }
        node = node.parent;
    }
    return null;
}

// Starting from the current node, recursively finds all childnodes that are of type nodeType.
// If a regex is given, it is also checked whether the node's text contains this regular expression.
// This is done using the search() method, so an exact match is not required.
function findRecursiveChildNodes(node: ts.Node, nodeType: ts.SyntaxKind, regex?: RegExp): ts.Node[] {
    let nodes: ts.Node[] = [];
    node.getChildren().forEach(n => {
        if(n.kind === nodeType && (!regex || n.getText().search(regex) > -1)) {
            nodes.push(n);
        }
        findRecursiveChildNodes(n, nodeType, regex).forEach(c => nodes.push(c))
    });
    return nodes;
}

function rewriteStorageOnChangeEvent(path: string): Change[] {
    let changes: Change[] = [];

    // Get the sourcefile, nodes and the name of the firebase-functions and firebase-admin imports
    const sourceFile = getSourceFile(path);
    if(!sourceFile) {
        throw new SchematicsException(`unknown sourcefile at ${path}`)
    }
    let nodes = getSourceNodes(sourceFile);
    let fbFunctionsImportName = findImportAsName(nodes, 'firebase-functions', path);
    if(!fbFunctionsImportName) {
        return changes;
    }

    // Find event callbacks of storage.object().onChange
    let eventNodes = findEventNodes(nodes, fbFunctionsImportName, /storage.*onChange/);
    for(let eventNode of eventNodes) {
        // Change the name of the onChange event to onFinalize
        let eventNameNode = findSuccessor(eventNode, [ts.SyntaxKind.PropertyAccessExpression, ts.SyntaxKind.Identifier]);
        if(!eventNameNode) continue;
        changes.push(new ReplaceChange(path, eventNameNode.pos, eventNameNode.getFullText(), 'onFinalize'));

        // Find the ExpressionStatement of this event.
        // This is where we will add new ExpressionStatements for the new event handlers.
        let expressionStatementNode = findParentNode(eventNode, ts.SyntaxKind.ExpressionStatement, /onChange/);
        if(!expressionStatementNode) continue;

        // Now look for conditionals checking the resourceState property and extract their content to separate events.
        let ifNodes = findRecursiveChildNodes(eventNode, ts.SyntaxKind.IfStatement); // TODO: Dit gaat goed met else if, ook met else?
        console.log(`er zijn ${ifNodes.length} ifNodes`);
        for(let ifNode of ifNodes) {
            let resourceStateCheck = findSuccessor(ifNode, [ts.SyntaxKind.BinaryExpression/*, ts.SyntaxKind.StringLiteral*/]);
            if(!resourceStateCheck) {console.log('resourceStateCheck is undefined!'); continue;}
            console.log(`ResourceStateCheck: ${resourceStateCheck.getText()}`);
            if(resourceStateCheck && /exists|not_exists/.test(resourceStateCheck.getText())) {
                let blockNode = findSuccessor(ifNode, [ts.SyntaxKind.Block, ts.SyntaxKind.SyntaxList]);
                if(!blockNode) continue;

                let toAdd = blockNode.getFullText();
                let text = resourceStateCheck.getText();

                // Depending on text, generate different functions
                if(text.search('\'not_exists\'') > -1) {
                    toAdd = '\n\nexports.fileDeleted = functions.storage.object().onDelete((object, context) => {' + toAdd + '\n});';
                    console.log('not_exists: '+text);
                } else if(text.search('\'exists\'') > -1) {
                    toAdd = '\n\nexports.metadataUpdated = functions.storage.object().onMetadataUpdate((object, context) => {' + toAdd + '\n});';
                    console.log('exists: '+text);
                } else {
                    console.log('iets anders: '+text);
                }
                // Remove the ifstatement from the onChange function and insert a new expressionStatement node
                changes.push(new RemoveChange(path, ifNode.pos, ifNode.getFullText()));
                changes.push(new InsertChange(path, expressionStatementNode.end+1, toAdd));
            }
        }
    }
    return changes;
}

function readDir(host: Tree, path: string, fileExtension: string) {
    console.log(path);
    let list = fs.readdirSync(path);
    for (let filename of list) {
        if (fs.lstatSync(`${path}/${filename}`).isDirectory()) {
            readDir(host, `${path}/${filename}`, fileExtension);
        }

        // Build a changes array for this file and apply them one-by-one when finished
        else if (filename.endsWith(fileExtension)) {
            let changes: Change[] = [];

            rewriteInitializeApp(`${path}/${filename}`).forEach(c => changes.push(c));
            rewriteEvents(`${path}/${filename}`).forEach(c => changes.push(c));
            rewriteStorageOnChangeEvent(`${path}/${filename}`).forEach(c => changes.push(c));

            applyChanges(host, changes, <Path>`${path}/${filename}`);
        }
    }
}

function loopThroughFiles(path: string): Rule {
    return (host: Tree) => {
        readDir(host, path, '.ts');
        return host;
    };
}

export function fixBreakingChanges(options: FbBreaksOptions): Rule {
    return (tree: Tree, context: SchematicContext) => {
        const rule = chain([
            branchAndMerge(chain([
                loopThroughFiles(options.filesPath)
            ])),
        ]);
        return rule(tree, context);
    };
}
