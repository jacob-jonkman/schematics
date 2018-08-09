import { chain, Rule, SchematicContext, /*SchematicsException, */Tree } from '@angular-devkit/schematics';
import { Change, NoopChange, ReplaceChange/*, RemoveChange*/ } from '../schematics-angular-utils/change';
import { FbBreaksOptions } from './fbBreaksOptions';
import { tsquery } from '@phenomnomnominal/tsquery';
import { TSQueryNode } from '@phenomnomnominal/tsquery/dist/src/tsquery-types'
import * as ts from 'typescript';
import * as fs from 'fs';
import * as applier from './ChangeApplyer';
import { Traversal } from './traversal';

let traversal = new Traversal();
//let changes: Change[] = []; // The list of changes which is passed to ChangeApplier
const eventTypes: string[] = ['onCreate', 'onWrite', 'onUpdate', 'onDelete', 'onChange', 'onNewDetected'];
const triggers: string[] = ['database', 'firestore', 'auth', 'crashlytics', 'storage'];

// Loads the newest version of a source file so that previous writes are not forgotten
function getSourceFile(path: string): string {
    return fs.readFileSync(path).toString('utf-8');
}

function fixCrashlytics(fbNode: TSQueryNode, path: string): Change {
    if(!fbNode) return new NoopChange();
    let eventNode;
    if(fbNode) {
        eventNode = traversal.findSuccessor(fbNode, [ts.SyntaxKind.PropertyAccessExpression, ts.SyntaxKind.Identifier]);
    }
    if(eventNode && eventNode.getText() === 'onNewDetected') {
        return new ReplaceChange(path, eventNode.pos, eventNode.getText(), 'onNew');
    } else {
        return new NoopChange();
    }
}

// Returns the trigger type of the event found in sourceNode. Can be database, firestore, auth, crashlytics or storage
function getTriggerType(sourceNode: TSQueryNode): string {
    const [targetNode] = tsquery(sourceNode, `PropertyAccessExpression CallExpression PropertyAccessExpression`);
    for(let trigger of triggers) {
        if(targetNode.getText().search(trigger) > -1) {
            return trigger;
        }
    }
    return '';
}

function getEventType(sourceNode: TSQueryNode): string {
    for(let type of eventTypes) {
        if(sourceNode.getText().search(type) > -1) return type;
    }
    return '';
}

function rewriteEvents(path: string): Change[] {
    // Get the sourcefile, nodes and the name of the firebase-functions import
    let changes: Change[] = [];
    //console.log('we gaan nu ', path, 'herschrijven');
    const ast: ts.SourceFile = tsquery.ast(getSourceFile(path));
    let fbFunctionsImportName = traversal.findImportAsName(ast, 'firebase-functions');
    if(!fbFunctionsImportName) {
        return changes;
    }

    let firebaseFunctionNodes: TSQueryNode[] = [];
    for(let type of eventTypes) {
        tsquery(ast, `CallExpression:has([text="${type}"])`).forEach(n => firebaseFunctionNodes.push(n));
    }

    // Iterate over these functions
    for (let fbNode of firebaseFunctionNodes) {
        const trigger: string = getTriggerType(fbNode);
        const eventType = getEventType(fbNode);
        if(trigger === '' || eventType === '') {
            console.log('trigger:', trigger, 'eventType:',  eventType);
            continue;
        }

        // Make sure function has a callback
        let [arrowFunctionNode] = tsquery(fbNode, 'ArrowFunction');
        if (!arrowFunctionNode) {
            continue;
        }

        // Get the parameterlist to rename the event parameter
        let [eventParamNode] = tsquery(arrowFunctionNode, 'Parameter Identifier');
        if (!eventParamNode) continue;

        // Parse the name of the event's parameter for use in the rewriting stage.
        // If the parameter is called 'event', it should be changed to 'data', otherwise we use the given parameter name
        traversal.eventParamName = eventParamNode.getText();
        if(traversal.eventParamName === 'event') {
            traversal.eventParamNameToWrite = 'data';
        } else {
            traversal.eventParamNameToWrite = traversal.eventParamName;
        }

        // Rewrite the event parameter. If the parameter list was not already between parentheses, they should be added
        if(arrowFunctionNode.getChildren().find(n => n.kind === ts.SyntaxKind.OpenParenToken)) {
            changes.push(new ReplaceChange(path, eventParamNode.pos, traversal.eventParamName, `${traversal.eventParamNameToWrite}, context`));
        } else {
            changes.push(new ReplaceChange(path, eventParamNode.pos, traversal.eventParamName, `(${traversal.eventParamNameToWrite}, context)`));
        }

        // onNewDetected event of Crashlytics was renamed to onNew
        if(trigger === 'crashlytics') changes.push(fixCrashlytics(fbNode, path));

        // Find the body (=SyntaxList) of the callback
        let [eventBlockNode] = tsquery(arrowFunctionNode, 'Block');
        if(!eventBlockNode) continue;

       changes = changes.concat(traversal.findVariableUses(trigger, eventType, eventBlockNode, traversal.eventParamName, eventBlockNode.pos, traversal.eventParamName.split('.')[0], path));
    }
    return changes;
}

// function rewriteInitializeApp(_path: string): void {
    // Get the sourcefile, nodes and the name of the firebase-functions and firebase-admin imports
    // const ast: ts.SourceFile = tsquery.ast(getSourceFile(path));
    // let fbFunctionsImportName = traversal.findImportAsName(ast, 'firebase-functions');
    // let fbAdminImportName = traversal.findImportAsName(ast, 'firebase-admin');
    // if(!fbFunctionsImportName || !fbAdminImportName) {
    //     return;
    // }
    //
    // // Remove deprecated use of functions.config().firebase as parameter in admin.initializeApp()
    // // First find a use of the initializeApp() function
    // let [parametersNode] = tsquery(ast,`ExpressionStatement:has([text="${fbAdminImportName}.initializeApp"]) CallExpression PropertyAccessExpression:last-child`);
    // if(!parametersNode) {
    //     console.log('No parametersNode found in ' + path);
    //     return;
    // }
    // changes.push(new RemoveChange(path, parametersNode.pos, parametersNode.getFullText()));
    //
    // // Now replace remaining mentions of functions.config().firebase for process.env.FIREBASE_CONFIG
    // // TODO: Hier gaat het nog mis! //
    // let candidates = tsquery(ast,`PropertyAccessExpression:has([text="${fbFunctionsImportName}.config().firebase"])`);
    // if(!candidates) {
    //     console.log('geen candidates!');
    //     return
    // }
    // for(let candidate of candidates) {
    //     if(candidate.getText() === fbFunctionsImportName+'.config().firebase') {
    //         // Do not change the initializeApp() function call
    //         if(candidate.parent && candidate.parent.parent && candidate.parent.parent.getText().search('initializeApp')>-1) {
    //             continue;
    //         }
    //         let spaceOrNoSpace = '';
    //         if(candidate.getFullText()[0] === ' ') {
    //             spaceOrNoSpace = ' ';
    //         }
    //         changes.push(new ReplaceChange(path, candidate.pos, spaceOrNoSpace+fbFunctionsImportName+'.config().firebase', spaceOrNoSpace+'JSON.parse(process.env.FIREBASE_CONFIG)'));
    //     }
    // }
    // TODO //
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

function iterate(host: Tree, path: string, fileExtension: string) {
    console.log('pathhh:', path);
    let list = fs.readdirSync(path);
    for (let filename of list) {
        if (fs.lstatSync(`${path}/${filename}`).isDirectory() && filename !== 'node_modules') {
            iterate(host, `${path}/${filename}`, fileExtension);
        }

        // Build a changes array for this file and apply them one-by-one when finished
        else if (filename.endsWith(fileExtension)) {
            let changes: Change[] = [];
            changes = changes.concat(rewriteEvents(`${path}/${filename}`));
            // changes = changes.concat(rewriteInitializeApp(`${path}/${filename}`));
            // rewriteStorageOnChangeEvent(`${path}/${filename}`);

            applier.applyChanges(host, changes, <ts.Path>`${path}/${filename}`);
        }
    }
}

function readDir(path: string, fileExtension: string): Rule {
    return (host: Tree) => {
        iterate(host, path, fileExtension);
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
