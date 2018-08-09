import * as ts from 'typescript';
import { tsquery } from '@phenomnomnominal/tsquery';
import { TSQueryNode } from '@phenomnomnominal/tsquery/dist/src/tsquery-types';
import { Change, NoopChange, ReplaceChange } from "../schematics-angular-utils/change";

export class Traversal {
    eventParamName: string;
    eventParamNameToWrite: string;

    findImmediateChildNodes(node: ts.Node, nodeType: ts.SyntaxKind, regex: RegExp): ts.Node[] {
        return node.getChildren().filter(n => this.nodeIsOfType(n, nodeType) && (regex === undefined || n.getText().search(regex)));
    }

    // Starting from the current node, recursively finds all childnodes that are of type nodeType.
    // If a regex is given, it is also checked whether the node's text contains this regular expression.
    // This is done using the search() method, so an exact match is not required.
    findRecursiveChildNodes(node: ts.Node, nodeType: ts.SyntaxKind, regex?: RegExp): ts.Node[] {
        let nodes: ts.Node[] = [];
        node.getChildren().forEach(n => {
            if (this.nodeIsOfType(n, nodeType) && (!regex || this.nodeContainsString(n, regex))) {
                nodes.push(n);
            }
            this.findRecursiveChildNodes(n, nodeType, regex).forEach(c => nodes.push(c))
        });
        return nodes;
    }

    /*
     *  Starting from functionBlockNode, find all uses of the variable contained in variableName
     *  Calls
     *  @Input - trigger: Firebase function trigger (i.e. 'database', 'firestore', 'auth', etc.)
     *  @Input - eventType: Firebase function type (i.e. 'onCreate', 'onUpdate', etc.)
     *  @Input - functionBlockNode: The BlockNode of this firebase function
     *  @Input - variableName: The name of the variable whose usages we are looking for
     *  @Input - startingPos: Nodes that have a pos field lower than this number should not be evaluated to prevent endless loops
     *  @Input - varString: string of accessed object properties up to this variable without variable assignment names
     *           => 'var dat = event.data; var previous = dat.previous' gives varString: 'event.data.previous'
     *  @Input - path: Path to the currently read file
     *  @Returns - variableDeclarations: List of nodes in which the variable contained in variableName is used
     */
    findVariableUses(trigger: string, eventType: string, functionBlockNode: ts.Node, variableName: string, startingPos: number, varString: string, path: string): Change[] {
        // Start by finding all variableStatements in this function containing the eventParamName ('event' by default)
        let variableDeclarations = tsquery(functionBlockNode, `VariableStatement:has([text=${variableName}]) VariableDeclarationList VariableDeclaration`);
        let variableExpressions = tsquery(functionBlockNode, `ExpressionStatement:has([text=${variableName}])`);
        let changes: Change[] = [];
        console.log(' variablename:', variableName, 'startingPos:', startingPos);

        const candidates = variableDeclarations.concat(variableExpressions);
        candidates
            .filter(v => v.pos > startingPos) // Filter nodes that have a position smaller than the startingPos.
            .forEach(variableUse => {
                let [callExpression] = tsquery(variableUse,  'CallExpression');
                if(callExpression) { // CallExpression, no further recursion
                    console.log('callExpression! ziet er zo uit', callExpression.getText());
                    // ExpressionStatements can be function calls with (multiple) parameters. If call has parameters, it is dubbed an ExpressionStatement
                    if(variableUse.kind === ts.SyntaxKind.ExpressionStatement) {
                        let parameters = tsquery(variableUse, `PropertyAccessExpression:has([text=${variableName}])`);
                        parameters
                            .filter((p, index) => {
                                return (index === 0 || p.end > parameters[index-1].end);
                            })
                            .forEach(p => {
                            let paramString = varString.concat('.').concat(p.getText().split('.').slice(1).join('.'));
                            console.log('begin checkRewrite 2. paramstring:', paramString);
                            changes = changes.concat(this.checkRewrite(trigger, eventType, p, paramString, path));
                        });
                    } else { // Simple CallExpression without parameters
                        let callString = varString.concat('.').concat(callExpression.getText().split('.').slice(1).join('.'));
                        console.log('begin checkRewrite 3. callstring:', callString);
                        changes = changes.concat(this.checkRewrite(trigger, eventType, callExpression, callString, path));
                    }
                } else { // VariableDeclaration, further recursion required
                    let propertyAccessExpressions = tsquery(variableUse, 'PropertyAccessExpression');
                    let previousPos = -1;
                    let previousEnd = -1;

                    propertyAccessExpressions
                        .filter((p, index) => {
                            console.log(index, 'pos', p.pos, '-', previousPos, 'end', p.end, '-', previousEnd);
                            if(p.pos > previousPos && p.end > previousEnd) {
                                console.log('ja joh', p.getText());
                                previousPos = p.pos;
                                previousEnd = p.end;
                                return true;
                            }
                        })
                        .forEach(propertyAccessExpression => {
                            console.log('prop:', propertyAccessExpression.getText());
                            if (propertyAccessExpression) {
                                let [newVarName, assignment] = variableUse.getText().split('=');
                                newVarName = newVarName.trim();
                                assignment = assignment.split('.')[1].trim();
                                let paramString = varString.concat('.', assignment);
                                console.log('begin checkRewrite');
                                changes = changes.concat(this.checkRewrite(trigger, eventType, propertyAccessExpression, paramString, path));
                                console.log('klaar met checkrewrite, ga zoeken naar var:', newVarName);
                                changes = changes.concat(this.findVariableUses(trigger, eventType, functionBlockNode, newVarName, propertyAccessExpression.end, paramString, path));
                                console.log('klaar met findvaruses');
                            }
                        });
                    console.log('klaar met propertyAccessExpressions');
                }
            });
        return changes;
    }

    checkRewrite(trigger: string, eventType: string, node: ts.Node, _varString: string, path: string): Change {
        let nodeText = node.getFullText()
            .replace(`${this.eventParamName}.data`, this.eventParamNameToWrite)
            .replace( this.eventParamName, this.eventParamNameToWrite);
        console.log('checkrewrite. nodetext =', nodeText, 'trigger:', trigger, 'event:', eventType, '_varString:');
        if (trigger === 'database') {
            if(eventType === 'onCreate') {

            } else if(eventType === 'onWrite' || eventType === 'onUpdate') {
                console.log('onupdate')
                nodeText = nodeText
                    .replace('previous', 'before')
                    .replace('data.val', 'data.after.val');
                console.log('achteraf is nodetext=', nodeText);
            } else if(eventType === 'onDelete') {
                nodeText = nodeText
                    .replace('previous.val', 'val')
                    .replace('.previous', '');
            } else {
                return new NoopChange();
            }
            return new ReplaceChange(path, node.pos, node.getFullText(), nodeText);
        } else if (trigger === 'firestore') {
            if(eventType === 'onCreate' || eventType === 'onDelete') {
                nodeText = nodeText.replace('.previous', '');
            } else if(eventType === 'onWrite' || eventType === 'onUpdate') {
                nodeText = nodeText
                    .replace('previous', 'before')
                    .replace(`${this.eventParamNameToWrite}.data`, `${this.eventParamNameToWrite}.after.data`);
            } else {
                return new NoopChange();
            }
            return new ReplaceChange(path, node.pos, node.getFullText(), nodeText);
        } else if (trigger === 'auth') {
            nodeText = nodeText
                .replace('createdAt', 'creationTime')
                .replace('lastSignedInAt', 'lastSignInTime');
            return new ReplaceChange(path, node.pos, node.getFullText(), nodeText);
        }
        return new NoopChange();

    }
    // Recursively traverses the syntax tree downward searching for a specific list of nodetypes.
    // The function only traverses downward when a match is found.
    findSuccessor(node: TSQueryNode, searchPath: ts.SyntaxKind[]): TSQueryNode | null | undefined {
        let children = node.getChildren();
        let next;

        for (let syntaxKind of searchPath) {
            next = children.find(n => n.kind === syntaxKind) as TSQueryNode;
            if (!next) return null;
            children = next.getChildren();
        }
        return next;
    }

    // Traverses upwards through the syntaxtree looking for a parent node of type nodeType.
    // If a regex is given, it is also checked whether the parent node's text contains this regular expression.
    // This is done using the search() method, so an exact match is not required.
    // If no match is found, null is returned.
    findParentNode(node: ts.Node, nodeType: ts.SyntaxKind, regex?: RegExp): ts.Node | null {
        while (node.parent) {
            if (this.nodeIsOfType(node.parent, nodeType) && (!regex || this.nodeContainsString(node.parent, regex))) {
                return node.parent;
            }
            node = node.parent;
        }
        return null;
    }

    // Looks for an import statement of the form 'import <package> as <importName> from <importPath>'
    // importName is returned if it exists
    findImportAsName(ast: ts.SourceFile, importPath: string): string {
        const [importDeclaration] = tsquery(ast, `ImportDeclaration:has([text="${importPath}"])`);
        return importDeclaration ? tsquery(importDeclaration, 'Identifier')[0].getText() : 'functions';
    }

    nodeIsOfType(node: ts.Node, kind: ts.SyntaxKind ): boolean {
        return node.kind === kind;
    }
    nodeContainsString(node: ts.Node, string: string|RegExp): boolean {
        return node.getText().search(string) > -1;
    }
}