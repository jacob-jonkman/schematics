import { chain, Rule, SchematicContext, SchematicsException, Tree } from '@angular-devkit/schematics';
import { Change, ReplaceChange } from "../schematics-angular-utils/change";
import { FbBreaksOptions } from "./fbBreaksOptions";
import { Traversal } from "./traversal";
import { Applier } from "./ChangeApplyer";
import { tsquery } from '@phenomnomnominal/tsquery';
import { TSQueryNode } from '@phenomnomnominal/tsquery/dist/src/tsquery-types'
import * as fs from 'fs';
import { SyntaxKind, Path } from 'typescript';

const traversal = new Traversal();
const applier = new Applier();

let changes: Change[] = []; // The list of changes which is passed to ChangeApplier

// Loads the newest version of a source file so that previous writes are not forgotten
function getSourceFile(path: string): string {
    return fs.readFileSync(path).toString('utf-8');
}

function fixCrashlytics(fbNode: TSQueryNode, path: string): void {
    if(!fbNode) return;
    let eventNode;
    if(fbNode instanceof Node) {
        eventNode = traversal.findSuccessor(fbNode, [SyntaxKind.PropertyAccessExpression, SyntaxKind.Identifier]);
    }
    if(eventNode && eventNode.getText() === 'onNewDetected') {
        changes.push(new ReplaceChange(path, eventNode.pos, eventNode.getText(), 'onNew'));
    }
}

// Returns the trigger type of the event found in sourceNode. Can be database, firestore, auth, crashlytics or storage
function getTriggerType(sourceNode: TSQueryNode, fbFunctionsImportName: string): string {
    let targetNode = traversal.findSuccessor(sourceNode, [
        SyntaxKind.PropertyAccessExpression,
        SyntaxKind.CallExpression,
        SyntaxKind.PropertyAccessExpression,
        SyntaxKind.PropertyAccessExpression
    ]);

    // Also check whether the functions import is included in targetNode
    if(targetNode && targetNode.getText().search(fbFunctionsImportName) !== -1) {
        const triggertype = targetNode.getText();
        if( triggertype === 'database' || 'firestore' || 'auth' || 'crashlytics' || 'storage') {
            return targetNode.getLastToken().getText();
        }
    }
    return '';
}

function rewriteEvents(path: string): void {
    // Get the sourcefile, nodes and the name of the firebase-functions import
    console.log('rewriteEvent!');
    const ast: string = getSourceFile(path);
    console.log('ast gemaakt!');
    let fbFunctionsImportName = traversal.findImportAsName(ast);// (nodes, 'firebase-functions', path);
    if(!fbFunctionsImportName) {
        return;
    }
    console.log('import gevonden!', fbFunctionsImportName);


    let [...callNodes] = tsquery(ast, 'CallExpression');
    console.log('callNodes!');


    // Find occurrences of the onDelete, onCreate, onUpdate and onWrite functions
    let firebaseFunctionNodes = callNodes.filter(node => node.getText().search(fbFunctionsImportName+'.*onDelete|onCreate|onUpdate|onWrite|onNewDetected|onChange')>-1);
    if(!firebaseFunctionNodes) {
        return;
    }

    // Iterate over these functions
    for (let fbNode of firebaseFunctionNodes) {
        if(!fbNode.parent) continue;

        const trigger: string = getTriggerType(fbNode as TSQueryNode, fbFunctionsImportName);
        if(trigger === '') {
            continue;
        }

        // Make sure function has a callback
        let arrowFunctionNode = traversal.findSuccessor(fbNode, [
                SyntaxKind.SyntaxList,
                SyntaxKind.ArrowFunction
            ]
        );
        if (!arrowFunctionNode) {
            continue;
        }

        // Get the parameterlist to rename the event parameter
        let eventParamNode = traversal.findSuccessor(arrowFunctionNode, [
                SyntaxKind.SyntaxList,
                SyntaxKind.Parameter,
                SyntaxKind.Identifier
            ]
        );
        if (!eventParamNode) {
            continue;
        }

        // Parse the name of the event's parameter for use in the rewriting stage.
        // If the parameter is called 'event', it should be changed to 'data', otherwise we use the given parameter name
        const eventParamName: string = eventParamNode.getText();
        let eventParamNameToWrite: string = eventParamName;
        if(eventParamName === 'event') {
            eventParamNameToWrite = 'data';
        }

        // Rewrite the event parameter. If the parameter list was not already between parentheses, they should be added
        // This can occur when only a single parameter was present
        if(arrowFunctionNode.getChildren().find(n => n.kind === SyntaxKind.OpenParenToken)) {
            changes.push(new ReplaceChange(path, eventParamNode.pos, eventParamName, `${eventParamNameToWrite}, context`));
        }
        else {
            changes.push(new ReplaceChange(path, eventParamNode.pos, eventParamName, `(${eventParamNameToWrite}, context)`));
        }

        // onNewDetected event of Crashlytics was renamed to onNew
        if(trigger === 'crashlytics') fixCrashlytics(fbNode, path);

        // Find the body (=SyntaxList) of the callback
        let eventBlockNode = traversal.findSuccessor(arrowFunctionNode, [
                SyntaxKind.Block,
                SyntaxKind.SyntaxList
            ]
        );
        if(!eventBlockNode) continue; // Try next candidate

        // For each FirebaseFunction callback, find usages of the event parameter so that they can be rewritten
        // eventdataCandidates are those childnodes of eventBlockNode which contain eventParamName
        let eventdataCandidates = eventBlockNode.getChildren().filter(n => n.getText().search(eventParamName) > -1);
        for(let candidate of eventdataCandidates) {

            // Recursively find the childnode of candidate that have type PropertyAccessExpression (should be one per candidate)
            let assignmentCandidates = tsquery(candidate, 'PropertyAccessExpression');

            // Find variable assignments of eventParamName and also recursively find uses of these variable assignments
            // const searchTerms = traversal.findVariableDeclarations(assignmentCandidates, eventParamName);
            //
            // searchTerms.forEach(s => {
            //     console.log('found searchterm:', s.getText());
            //     if(!eventBlockNode) return; // Just to please TSlint
            //     let eventdataCandidates = traversal.findRecursiveChildNodes(eventBlockNode, ts.SyntaxKind.PropertyAccessExpression, RegExp(s.getText()));
            //
            //     eventdataCandidates.forEach(c => assignmentCandidates.push(c));
            // });

            iterateOverAssignments(fbNode, assignmentCandidates, trigger, eventParamName, eventParamNameToWrite, path);
        }
    }
}

function iterateOverAssignments(fbNode: TSQueryNode, assignmentCandidates: TSQueryNode[], trigger: string, eventParamName: string, eventParamNameToWrite: string, path: string): void {
    let prevChangeEnd = -1;

    // Construct the change objects
    for(let assignment of assignmentCandidates) {
        //If parent is a PropertyAccessExpression and was already changed, skip this one
        if(assignment.parent && assignment.parent.kind === SyntaxKind.PropertyAccessExpression && assignment.end <= prevChangeEnd) {
            continue;
        }

        const nodeText = assignment.getText();

        // If the parameter starts with a space, this should be added to the change object as well.
        let spaceOrNoSpace = '';
        if(assignment.getFullText()[0] === ' ') {
            spaceOrNoSpace = ' ';
        }

        let changeString = '';

        // Trigger-specific changes
        if(trigger === 'database') {
            changeString = fixDatabaseEvents(fbNode, nodeText, path, eventParamName, eventParamNameToWrite);
        } else if (trigger === 'firestore') {
            changeString = fixFirestoreEvents(fbNode, nodeText, eventParamName, eventParamNameToWrite);
        } else if (trigger === 'auth') {
            changeString = fixAuthEvents(nodeText, assignment, eventParamName);
        }

        // Trigger-unspecific changes
        if(changeString === '') {
            if (fbNode.getText().search(/onWrite|onUpdate/) > -1 && nodeText === `${eventParamName}.data.data`) {
                changeString = `${eventParamNameToWrite}.after.data`;
            } else if (nodeText === `${eventParamName}.data.adminRef.parent`) {
                changeString = `${eventParamNameToWrite}.ref.parent`;
            } else if (nodeText === `${eventParamName}.data`) {
                changeString = `${eventParamNameToWrite}`;
            } else if (nodeText === `${eventParamName}.params`) {
                changeString = 'context.params';
            }
        }

        if(changeString != '') {
            changes.push(new ReplaceChange(
                path,
                assignment.pos,
                spaceOrNoSpace+nodeText,
                spaceOrNoSpace+changeString
            ));
            prevChangeEnd = assignment.end;
        }
    }
}

// Contains the trigger-specific changes of Firebase Realtime Database
function fixDatabaseEvents(fbNode: TSQueryNode, nodeText: string, path: string, eventParamName: string, eventParamNameToWrite: string): string {
    if(fbNode.getText().search(/onWrite|onUpdate/) > -1 && nodeText === `${eventParamName}.data.val`) {
        return `${eventParamNameToWrite}.after.val`;
    } else if(fbNode.getText().search(/onWrite|onUpdate/) > -1 && nodeText === `${eventParamName}.data.previous.val`) {
        return `${eventParamNameToWrite}.before.val`;
    } else if(fbNode.getText().search(/onDelete/) > -1 && nodeText === `${eventParamName}.data.previous.val`) {
        return `${eventParamNameToWrite}.val`;
    } else if(nodeText === `${eventParamName}.data.ref.parent`) {
        throw new SchematicsException(`Use of deprecated variable event.data.ref.parent was found in file ${path}. The use of this statement is too context sensitive so please remove it by hand.`);
    }
    return '';
}

// Contains the trigger-specific changes of Firebase Firestore
function fixFirestoreEvents(fbNode: TSQueryNode, nodeText: string, eventParamName: string, eventParamNameToWrite: string): string {
    if(fbNode.getText().search(/onWrite|onUpdate/) > -1 && nodeText === `${eventParamName}.data`) {
        return nodeText.replace(`${eventParamName}.data`, `${eventParamNameToWrite}.after.data`);
    } else if(fbNode.getText().search(/onWrite|onUpdate/) > -1 && nodeText === `${eventParamName}.data.previous.data`) {
        return nodeText.replace(`${eventParamName}.data.previous.data`, `${eventParamNameToWrite}.before.data`);//.replace(`${eventParamName}.`, '');
    }
    return '';
}

// Contains the trigger-specific changes of Firebase Auth
function fixAuthEvents(nodeText: string, assignmentNode: TSQueryNode, eventParamName: string): string {
    //console.log(nodeText);
    if(nodeText.search(/lastSignedInAt|createdAt/) > -1) {
        let identifierNode = assignmentNode.getLastToken();
        if(identifierNode.kind === SyntaxKind.Identifier) {
            if(identifierNode.getText() === 'lastSignedInAt') {
                return nodeText.replace('lastSignedInAt','lastSignInTime').replace(`${eventParamName}.`, '');
            }
            else if(identifierNode.getText() === 'createdAt') {
                return nodeText.replace('createdAt', 'creationTime').replace(`${eventParamName}.`, '');
            }
        }
    }
    return '';
}

// function rewriteInitializeApp(path: string): void {
//     // Get the sourcefile, nodes and the name of the firebase-functions and firebase-admin imports
//     const sourceFile = getSourceFile(path);
//     if(!sourceFile) {
//         throw new SchematicsException(`unknown sourcefile at ${path}`)
//     }
//     let nodes = getSourceNodes(sourceFile);
//     let fbFunctionsImportName = traversal.findImportAsName(nodes, 'firebase-functions', path);
//     let fbAdminImportName = traversal.findImportAsName(nodes, 'firebase-admin', path);
//
//     let syntaxListNode = nodes.find(n => n.kind === ts.SyntaxKind.SyntaxList);
//     if(!syntaxListNode) {
//         throw new SchematicsException('No syntaxlist found in ' + path);
//     }
//
//     // Remove deprecated use of functions.config().firebase as parameter in admin.initializeApp()
//     // First find a use of the initializeApp() function
//     let expressionStatementNode = syntaxListNode.getChildren().find(n =>
//         n.kind === ts.SyntaxKind.ExpressionStatement &&
//         n.getText().search(fbAdminImportName+'.initializeApp') > -1
//     );
//     if(!expressionStatementNode) {
//         //console.log('No expressionStatementNode found in ' + path);
//         return;
//     }
//     // Now get its function node
//     let callExpressionNode = expressionStatementNode.getChildren().find(n => n.kind === ts.SyntaxKind.CallExpression);
//     if(!callExpressionNode) {
//         //console.log('No callExpressionNode found in ' + path);
//         return;
//     }
//
//     // If there is a parameter, it should be removed.
//     let parametersNode = callExpressionNode.getChildren().find(n =>n.kind === ts.SyntaxKind.SyntaxList);
//     if(!parametersNode) {
//         //console.log('No parameters node found in ' + path);
//         return;
//     }
//     changes.push(new RemoveChange(path, parametersNode.pos, parametersNode.getFullText()));
//
//     let candidates = nodes.filter(n => n.kind===ts.SyntaxKind.PropertyAccessExpression
//         && n.getText().search('initializeApp')===-1);
//     for(let candidate of candidates) {
//         if(candidate.getText() === fbFunctionsImportName+'.config().firebase'){
//             // Do not change the initializeApp() function call
//             if(candidate.parent && candidate.parent.parent && candidate.parent.parent.getText().search('initializeApp')>-1) {
//                 continue;
//             }
//             let spaceOrNoSpace = '';
//             if(candidate.getFullText()[0] === ' ') {
//                 spaceOrNoSpace = ' ';
//             }
//             changes.push(new ReplaceChange(path, candidate.pos, spaceOrNoSpace+fbFunctionsImportName+'.config().firebase', spaceOrNoSpace+'JSON.parse(process.env.FIREBASE_CONFIG)'));
//         }
//     }
// }

// function findEventNodes(nodes: ts.Node[], fbFunctionsImportName: string, regex?: RegExp): ts.Node[] {
//     return nodes.filter(n =>
//            n.kind === ts.SyntaxKind.CallExpression
//         && n.getText().search(fbFunctionsImportName) > -1
//         && (regex === undefined || n.getText().search(regex) > -1)
//     );
// }

// function rewriteStorageOnChangeEvent(path: string): void {
//     // Get the sourcefile, nodes and the name of the firebase-functions and firebase-admin imports
//     const sourceFile = getSourceFile(path);
//     if(!sourceFile) {
//         throw new SchematicsException(`unknown sourcefile at ${path}`)
//     }
//     let nodes = getSourceNodes(sourceFile);
//     let fbFunctionsImportName = traversal.findImportAsName(nodes, 'firebase-functions', path);
//     if(!fbFunctionsImportName) {
//         return;
//     }
//
//     // Find event callbacks of storage.object().onChange
//     let eventNodes = findEventNodes(nodes, fbFunctionsImportName, /storage.*onChange/);
//     for(let eventNode of eventNodes) {
//         // Change the name of the onChange event to onFinalize
//         let eventNameNode = traversal.findSuccessor(eventNode, [ts.SyntaxKind.PropertyAccessExpression, ts.SyntaxKind.Identifier]);
//         if(!eventNameNode) continue;
//         changes.push(new ReplaceChange(path, eventNameNode.pos, eventNameNode.getFullText(), 'onFinalize'));
//
//         // Find the ExpressionStatement of this event.
//         // This is where we will add new ExpressionStatements for the new event handlers.
//         let expressionStatementNode = traversal.findParentNode(eventNode, ts.SyntaxKind.ExpressionStatement, /onChange/);
//         if(!expressionStatementNode) continue;
//
//         // Now look for conditionals checking the resourceState property and extract their content to separate events.
//         let ifNodes = traversal.findRecursiveChildNodes(eventNode, ts.SyntaxKind.IfStatement); // TODO: Dit gaat goed met else if, ook met else?
//         for(let ifNode of ifNodes) {
//             let resourceStateCheck = traversal.findSuccessor(ifNode, [ts.SyntaxKind.BinaryExpression/*, ts.SyntaxKind.StringLiteral*/]);
//             if(!resourceStateCheck) {
//                 console.log('resourceStateCheck is undefined!');
//             } else if(/exists|not_exists/.test(resourceStateCheck.getText())) {
//                 let blockNode = traversal.findSuccessor(ifNode, [ts.SyntaxKind.Block, ts.SyntaxKind.SyntaxList]);
//                 if(!blockNode) continue;
//
//                 let toAdd = blockNode.getFullText();
//                 let text = resourceStateCheck.getText();
//
//                 // Depending on text, generate different functions
//                 if(text.search('\'not_exists\'') > -1) {
//                     toAdd = '\n\nexports.fileDeleted = functions.storage.object().onDelete((object, context) => {' + toAdd + '\n});';
//                 } else if(text.search('\'exists\'') > -1) {
//                     toAdd = '\n\nexports.metadataUpdated = functions.storage.object().onMetadataUpdate((object, context) => {' + toAdd + '\n});';
//                 }
//                 // Remove the ifstatement from the onChange function and insert a new expressionStatement node
//                 changes.push(new RemoveChange(path, ifNode.pos, ifNode.getFullText()));
//                 changes.push(new InsertChange(path, expressionStatementNode.end+1, toAdd));
//             }
//         }
//     }
// }

function readDir(path: string, fileExtension: string): Rule {
    return (host: Tree) => {
        let list = fs.readdirSync(path);
        for (let filename of list) {
            console.log(filename);
            if (fs.lstatSync(`${path}/${filename}`).isDirectory()) {
                readDir(`${path}/${filename}`, fileExtension);
            }

            // Build a changes array for this file and apply them one-by-one when finished
            else if (filename.endsWith(fileExtension)) {
                // rewriteInitializeApp(`${path}/${filename}`);
                rewriteEvents(`${path}/${filename}`);
                // rewriteStorageOnChangeEvent(`${path}/${filename}`);

                applier.applyChanges(host, changes, <Path>`${path}/${filename}`);
            }
        }
        return host;
    }
}

export function fixBreakingChanges(options: FbBreaksOptions): Rule {
    console.log('doen we wel ietss?');
    return (tree: Tree, context: SchematicContext) => {
        const rule = chain([
            readDir(options.filesPath, '.ts')
        ]);
        return rule(tree, context);
    };
}
