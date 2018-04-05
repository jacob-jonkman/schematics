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

function rewriteEvents(host: Tree, path: string) {
    let changes: Change[] = [];
    const sourceFile = getSourceFile(path);
    if(!sourceFile) {
        throw new SchematicsException(`unknown sourcefile at ${path}`)
    }

    let nodes = getSourceNodes(sourceFile);

    let callNodes = nodes.filter(n => {
        return n.kind === ts.SyntaxKind.CallExpression;
    });
    let firebaseFunctionNodes = callNodes.filter(node => node.getText().search('onDelete|onCreate|onUpdate|onWrite')>-1);
    if(!firebaseFunctionNodes) {
        console.log('No events found in file: ' + path);
        return null;
    }

    for (let fbNode of firebaseFunctionNodes) {
        if(!fbNode.parent) continue;

        let arrowFunctionNode = findSuccessor(fbNode, [
                ts.SyntaxKind.SyntaxList,
                ts.SyntaxKind.ArrowFunction
            ]
        );
        if (!arrowFunctionNode) {
            console.log('No arrowFunctionNode found in file: ' + path);
            continue;
        }
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
        if(arrowFunctionNode.getChildren().find(n => n.kind == ts.SyntaxKind.OpenParenToken))
            changes.push(new ReplaceChange(path, eventParamNode.pos, 'event', 'data, context'));
        else
            changes.push(new ReplaceChange(path, eventParamNode.pos, 'event', '(data, context)'));

        let eventBlockNode: ts.Node|undefined|null = findSuccessor(arrowFunctionNode, [
                ts.SyntaxKind.Block,
                ts.SyntaxKind.SyntaxList
            ]
        );
        if(!eventBlockNode) continue;
        let eventdataCandidates = eventBlockNode.getChildren().filter(n => n.getText().search('event.data') > -1);
        for(let candidate of eventdataCandidates) {
            let actualCandidates = findNodes(candidate, ts.SyntaxKind.PropertyAccessExpression);
            for(let assignment of actualCandidates) {
                if(assignment.getFullText() === ' event.data') {
                    changes.push(new ReplaceChange(path, assignment.pos, ' event.data', ' data'));
                }
                if(assignment.getFullText() === 'event.data') {
                    changes.push(new ReplaceChange(path, assignment.pos, 'event.data', 'data'));
                }
            }
        }
        let eventparamsCandidates = eventBlockNode.getChildren().filter(n => n.getText().search('event.params') > -1);
        for(let candidate of eventparamsCandidates) {
            let actualCandidates = findNodes(candidate, ts.SyntaxKind.PropertyAccessExpression);
            for(let assignment of actualCandidates) {
                if(assignment.getFullText() === ' event.params') {
                    changes.push(new ReplaceChange(path, assignment.pos, ' event.params', ' context.params'));
                }
                if(assignment.getFullText() === 'event.params') {
                    changes.push(new ReplaceChange(path, assignment.pos, 'event.params', 'context.params'));
                }
            }
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

function readDir(host: Tree, path: string, fileExtension: string) {
    console.log(path);
    let list = fs.readdirSync(path);
    for (let filename of list) {
        if (fs.lstatSync(`${path}/${filename}`).isDirectory()) {
            readDir(host, `${path}/${filename}`, fileExtension);
        }
        else if (filename.endsWith(fileExtension)) {
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
