import { chain, Rule, SchematicContext, SchematicsException, Tree } from '@angular-devkit/schematics';
import { Change, ReplaceChange, RemoveChange } from '../schematics-angular-utils/change';
import { FbBreaksOptions } from './fbBreaksOptions';
import { tsquery } from '@phenomnomnominal/tsquery';
import { TSQueryNode } from '@phenomnomnominal/tsquery/dist/src/tsquery-types'
import * as ts from 'typescript';
import * as fs from 'fs';
import * as applier from './ChangeApplyer';
import * as traversal from './traversal';

let changes: Change[] = []; // The list of changes which is passed to ChangeApplier

// Loads the newest version of a source file so that previous writes are not forgotten
function getSourceFile(path: string): string {
    return fs.readFileSync(path).toString('utf-8');
}

function fixCrashlytics(fbNode: TSQueryNode, path: string): void {
    if(!fbNode) return;
    let eventNode;
    if(fbNode) {
        eventNode = traversal.findSuccessor(fbNode, [ts.SyntaxKind.PropertyAccessExpression, ts.SyntaxKind.Identifier]);
    }
    if(eventNode && eventNode.getText() === 'onNewDetected') {
        changes.push(new ReplaceChange(path, eventNode.pos, eventNode.getText(), 'onNew'));
    }
}

// Returns the trigger type of the event found in sourceNode. Can be database, firestore, auth, crashlytics or storage
function getTriggerType(sourceNode: TSQueryNode, fbFunctionsImportName: string): string {
    const [targetNode] = tsquery(sourceNode, `PropertyAccessExpression:has([text="${fbFunctionsImportName}"]) CallExpression PropertyAccessExpression PropertyAccessExpression`);
    return targetNode ? targetNode.getText().split('.')[1] : '';
}

function rewriteEvents(path: string): void {
    // Get the sourcefile, nodes and the name of the firebase-functions import
    const ast: ts.SourceFile = tsquery.ast(getSourceFile(path));
    let fbFunctionsImportName = traversal.findImportAsName(ast, 'firebase-functions');
    if(!fbFunctionsImportName) {
        return;
    }

    let firebaseFunctionNodes: TSQueryNode[] = [];
    tsquery(ast, `CallExpression:has([text="onCreate"])`).forEach(n => firebaseFunctionNodes.push(n));
    tsquery(ast, `CallExpression:has([text="onWrite"])`).forEach(n => firebaseFunctionNodes.push(n));
    tsquery(ast, `CallExpression:has([text="onUpdate"])`).forEach(n => firebaseFunctionNodes.push(n));
    tsquery(ast, `CallExpression:has([text="onDelete"])`).forEach(n => firebaseFunctionNodes.push(n));
    tsquery(ast, `CallExpression:has([text="onChange"])`).forEach(n => firebaseFunctionNodes.push(n));
    tsquery(ast, `CallExpression:has([text="onNewDetected"])`).forEach(n => firebaseFunctionNodes.push(n));

    // Iterate over these functions
    for (let fbNode of firebaseFunctionNodes) {
        const trigger: string = getTriggerType(fbNode, fbFunctionsImportName);
        if(trigger === '') continue;
        console.log('\ntrigger is:', trigger);

        // Make sure function has a callback
        let [arrowFunctionNode] = tsquery(fbNode, 'ArrowFunction');
        if (!arrowFunctionNode) continue;

        // Get the parameterlist to rename the event parameter
        let [eventParamNode] = tsquery(arrowFunctionNode, 'Parameter Identifier');
        if (!eventParamNode) continue;

        // Parse the name of the event's parameter for use in the rewriting stage.
        // If the parameter is called 'event', it should be changed to 'data', otherwise we use the given parameter name
        const eventParamName: string = eventParamNode.getText();
        let eventParamNameToWrite: string = eventParamName;
        if(eventParamName === 'event') {
            eventParamNameToWrite = 'data';
        }

        // Rewrite the event parameter. If the parameter list was not already between parentheses, they should be added
        if(arrowFunctionNode.getChildren().find(n => n.kind === ts.SyntaxKind.OpenParenToken)) {
            changes.push(new ReplaceChange(path, eventParamNode.pos, eventParamName, `${eventParamNameToWrite}, context`));
        } else {
            changes.push(new ReplaceChange(path, eventParamNode.pos, eventParamName, `(${eventParamNameToWrite}, context)`));
        }

        // onNewDetected event of Crashlytics was renamed to onNew
        if(trigger === 'crashlytics') fixCrashlytics(fbNode, path);

        // Find the body (=SyntaxList) of the callback
        let [eventBlockNode] = tsquery(arrowFunctionNode, 'Block');
        if(!eventBlockNode) continue;

        const variableStatements = traversal.findVariableUses(eventBlockNode, eventParamName, eventBlockNode.pos, eventParamName);
        console.log('We zijn klaar met findVariableUses. variableStatements (', variableStatements.length, 'elementen) ziet er nu zo uit:');
        variableStatements.map(v => console.log('\t', v.getText()));
        iterateOverAssignments(fbNode, variableStatements, trigger, eventParamName, eventParamNameToWrite, path);
    }
}

function iterateOverAssignments(fbNode: TSQueryNode, variableStatements: ts.Node[], trigger: string, eventParamName: string, eventParamNameToWrite: string, path: string): void {
    // Construct the change objects
    variableStatements.forEach(assignment => {
        if(!assignment) {
            return;
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
        }
    });
}

// Contains the trigger-specific changes of Firebase Realtime Database
function fixDatabaseEvents(fbNode: TSQueryNode, nodeText: string, path: string, eventParamName: string, eventParamNameToWrite: string): string {
    if(fbNode.getText().search(/onWrite|onUpdate/) > -1 && nodeText === `${eventParamName}.data.val`) {
        return `${eventParamNameToWrite}.after.val`;
    } else if(fbNode.getText().search(/onWrite|onUpdate/) > -1 && nodeText === `${eventParamName}.data.previous.val`) {
        return `${eventParamNameToWrite}.before.val`;
    } else if (fbNode.getText().search(/onCreate/) > -1 && nodeText === `${eventParamName}.data.val`){
        return `${eventParamNameToWrite}.val`;
    } else if(fbNode.getText().search(/onDelete/) > -1 && nodeText === `${eventParamName}.data.previous.val`) {
        return `${eventParamNameToWrite}.val`;
    } else if(nodeText === `${eventParamName}.data.ref.parent`) {
        throw new SchematicsException(`Use of deprecated variable event.data.ref.parent was found in file ${path}. The use of this statement is too context sensitive so please remove it by hand.`);
    }
    return '';
}

// Contains the trigger-specific changes of Firebase Firestore
function fixFirestoreEvents(fbNode: TSQueryNode, nodeText: string, eventParamName: string, eventParamNameToWrite: string): string {
    if(fbNode.getText().search(/onWrite|onUpdate/) > -1 && nodeText === `${eventParamName}.data.data`) {
        return `${eventParamNameToWrite}.after.data`;
        //return nodeText.replace(`${eventParamName}.data`, `${eventParamNameToWrite}.after.data`);
    } else if(fbNode.getText().search(/onWrite|onUpdate/) > -1 && nodeText === `${eventParamName}.data.previous.data`) {
        return nodeText.replace(`${eventParamName}.data.previous.data`, `${eventParamNameToWrite}.before.data`);//.replace(`${eventParamName}.`, '');
    } else if(fbNode.getText().search(/onCreate|onDelete/) > -1 && nodeText === `${eventParamName}.data.previous.data`) {
        return `${eventParamNameToWrite}.data`;
    }
    return '';
}

// Contains the trigger-specific changes of Firebase Auth
function fixAuthEvents(nodeText: string, assignmentNode: ts.Node, eventParamName: string): string {
    //console.log(nodeText);
    if(nodeText.search(/lastSignedInAt|createdAt/) > -1) {
        let identifierNode = assignmentNode.getLastToken();
        if(identifierNode.kind === ts.SyntaxKind.Identifier) {
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

function rewriteInitializeApp(path: string): void {
    // Get the sourcefile, nodes and the name of the firebase-functions and firebase-admin imports
    const ast: ts.SourceFile = tsquery.ast(getSourceFile(path));
    let fbFunctionsImportName = traversal.findImportAsName(ast, 'firebase-functions');
    let fbAdminImportName = traversal.findImportAsName(ast, 'firebase-admin');
    if(!fbFunctionsImportName || !fbAdminImportName) {
        return;
    }

    // Remove deprecated use of functions.config().firebase as parameter in admin.initializeApp()
    // First find a use of the initializeApp() function
    let [parametersNode] = tsquery(ast,`ExpressionStatement:has([text="${fbAdminImportName}.initializeApp"]) CallExpression PropertyAccessExpression:last-child`);
    if(!parametersNode) {
        console.log('No parametersNode found in ' + path);
        return;
    }
    changes.push(new RemoveChange(path, parametersNode.pos, parametersNode.getFullText()));

    // Now replace remaining mentions of functions.config().firebase for process.env.FIREBASE_CONFIG
    // TODO: Hier gaat het nog mis! //
    let candidates = tsquery(ast,`PropertyAccessExpression:has([text="${fbFunctionsImportName}.config().firebase"])`);
    if(!candidates) {
        console.log('geen candidates!');
        return
    }
    for(let candidate of candidates) {
        if(candidate.getText() === fbFunctionsImportName+'.config().firebase') {
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
    // TODO //
}

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
                rewriteEvents(`${path}/${filename}`);
                rewriteInitializeApp(`${path}/${filename}`);
                // rewriteStorageOnChangeEvent(`${path}/${filename}`);

                applier.applyChanges(host, changes, <ts.Path>`${path}/${filename}`);
            }
        }
        return host;
    }
}

export function fixBreakingChanges(options: FbBreaksOptions): Rule {
    return (tree: Tree, context: SchematicContext) => {
        const rule = chain([
            readDir(options.filesPath, '.ts')
        ]);
        return rule(tree, context);
    };
}
