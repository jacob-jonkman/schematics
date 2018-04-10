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
function rewriteEvents(host: Tree, path: string) {
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
        return null;
    }

    // Find occurrences of the onDelete, onCreate, onUpdate and onWrite functions
    let firebaseFunctionNodes = callNodes.filter(node => node.getText().search(fbFunctionsImportName+'.*onDelete|onCreate|onUpdate|onWrite')>-1);
    if(!firebaseFunctionNodes) {
        console.log('No events found in file: ' + path);
        return null;
    }
    // Iterate over these functions
    for (let fbNode of firebaseFunctionNodes) {
        if(!fbNode.parent) continue;

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
        if(arrowFunctionNode.getChildren().find(n => n.kind == ts.SyntaxKind.OpenParenToken))
            changes.push(new ReplaceChange(path, eventParamNode.pos, 'event', 'data, context'));
        else
            changes.push(new ReplaceChange(path, eventParamNode.pos, 'event', '(data, context)'));

        // Find the body (=SyntaxList) of the callback
        let eventBlockNode: ts.Node|undefined|null = findSuccessor(arrowFunctionNode, [
                ts.SyntaxKind.Block,
                ts.SyntaxKind.SyntaxList
            ]
        );
        if(!eventBlockNode) continue; // Try next candidate

        // Find usages of the event parameter and rewrite them
        let eventdataCandidates = eventBlockNode.getChildren().filter(n => n.getText().search('event') > -1);
        for(let candidate of eventdataCandidates) {
            let assignmentCandidates = findNodes(candidate, ts.SyntaxKind.PropertyAccessExpression);

            // Construct the right change object
            for(let assignment of assignmentCandidates) {

                // If the parameter starts with a space, this should be added to the change object as well.
                let spaceOrNoSpace = '';
                if(assignment.getFullText()[0] === ' ') {
                    spaceOrNoSpace = ' ';
                }

                // Operation-specific changes
                if(fbNode.getText().search(/onWrite|onUpdate/) > -1 && assignment.getText() === 'event.data.data') {
                    changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+'event.data.data', spaceOrNoSpace+'data.after.data'));
                } else if(fbNode.getText().search(/onWrite|onUpdate/) > -1 && assignment.getText() === 'event.previous.data') {
                    changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+'event.previous.data()', spaceOrNoSpace+'data.before.data'));
                } else if(fbNode.getText().search(/onDelete/) > -1 && assignment.getText() === 'event.data.previous.val') {
                    changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+'event.data.previous.val', spaceOrNoSpace+'data.val'));
                }

                // Use of deprecated variable
                else if(assignment.getText() === 'event.data.ref.parent') {
                    //changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+'event.data.ref.parent', spaceOrNoSpace+'event.data.ref.parent//TODO DIT IS NIET CORRECT MEER'));
                    throw new SchematicsException(`Use of deprecated variable event.data.ref.parent was found in file ${path}. The use of this statement is too context sensitive so please remove it by hand.`);
                }

                // Simple variable rewriting
                else if(assignment.getText() === 'event.data.adminRef.parent') {
                    changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+'event.data.adminRef.parent', spaceOrNoSpace+'data.ref.parent'));
                } else if(assignment.getText() === 'event.data') {
                    changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+'event.data', spaceOrNoSpace+'data'));
                } else if(assignment.getFullText() === ' event.params') {
                    changes.push(new ReplaceChange(path, assignment.pos, spaceOrNoSpace+'event.params', spaceOrNoSpace+'context.params'));
                }
            }
        }
    }
    applyChanges(host, changes, <Path>path);
}

function rewriteInitializeApp(host: Tree, path: string) {
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

    // Remove deprecated use of function.config().firebase as parameter in admin.initializeApp()
    // First find a use of the initializeApp() function
    let expressionStatementNode = syntaxListNode.getChildren().find(n =>
        n.kind === ts.SyntaxKind.ExpressionStatement &&
        n.getText().search(fbAdminImportName+'.initializeApp') > -1
    );
    if(!expressionStatementNode) {
        console.log('No expressionStatementNode found in ' + path);
        return null;
    }
    // Now get its function node
    let callExpressionNode = expressionStatementNode.getChildren().find(n => n.kind === ts.SyntaxKind.CallExpression);
    if(!callExpressionNode) {
        console.log('No callExpressionNode found in ' + path);
        return null;
    }

    // If there is a parameter, it should be removed.
    let parametersNode = callExpressionNode.getChildren().find(n =>n.kind === ts.SyntaxKind.SyntaxList);
    if(!parametersNode) {
        console.log('No parameters node found in ' + path);
        return null;
    }
    changes.push(new RemoveChange(path, parametersNode.pos, parametersNode.getFullText()));

    // Remove deprecated use of functions.config().firebase
    let candidates = findNodes(syntaxListNode, ts.SyntaxKind.PropertyAccessExpression);
    for(let candidate of candidates) {
        if(candidate.getText() === fbFunctionsImportName+'config().firebase'){
            let spaceOrNoSpace = '';
            if(candidate.getFullText()[0] === ' ') {
                spaceOrNoSpace = ' ';
            }
            changes.push(new ReplaceChange(path, candidate.pos, spaceOrNoSpace+fbFunctionsImportName+'.config().firebase', spaceOrNoSpace+'process.env.FIREBASE_CONFIG'));
        }
    }

    applyChanges(host, changes, <Path>path);
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
            console.log('ReplaceChange. pos: ' + change.pos + ' oldText: ' + change.oldText + 'newtext: ' + change.newText);
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

function findSuccessor(node: ts.Node, searchPath: ts.SyntaxKind[] ) {
    let children = node.getChildren();
    let next: ts.Node | undefined;

    for(let syntaxKind of searchPath) {
        console.log(syntaxKind.toString());
        next = children.find(n => n.kind == syntaxKind);
        if (!next) return null;
        children = next.getChildren();
    }
    return next;
}

function readDir(host: Tree, path: string, fileExtension: string) {
    console.log(path);
    let list = fs.readdirSync(path);
    for (let filename of list) {
        if (fs.lstatSync(`${path}/${filename}`).isDirectory()) {
            readDir(host, `${path}/${filename}`, fileExtension);
        }
        // Important: Run RewriteInitializeApp before RewriteEvents or this might break
        else if (filename.endsWith(fileExtension)) {
            rewriteInitializeApp(host, `${path}/${filename}`);
            rewriteEvents(host, `${path}/${filename}`);
        }
    }
}

function loopThroughFiles(path: string, _options: FbBreaksOptions): Rule {
    return (host: Tree) => {
        readDir(host, path, '.ts');
        return host;
    };
}

export function fixBreakingChanges(options: FbBreaksOptions): Rule {
    return (tree: Tree, context: SchematicContext) => {
        const rule = chain([
            branchAndMerge(chain([
                loopThroughFiles(options.filesPath, options)
            ])),
        ]);
        return rule(tree, context);
    };
}
