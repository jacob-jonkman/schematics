import * as ts from 'typescript';
import { tsquery } from '@phenomnomnominal/tsquery';
import { TSQueryNode } from '@phenomnomnominal/tsquery/dist/src/tsquery-types';
import { Change, NoopChange, ReplaceChange } from "../schematics-angular-utils/change";

export class Traversal {
    eventParamName: string;
    eventParamNameToWrite: string;
    trigger: string;
    eventType: string;
    path: string;

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

    handleVariableDeclaration(variableUse: TSQueryNode, varString: string, functionBlockNode: ts.Node): Change[] {
        console.log('we hebben een variableDeclaration! text:', variableUse.getText());
        let changes: Change[] = [];
        const propertyAccessExpressions = tsquery(variableUse, 'PropertyAccessExpression');
        propertyAccessExpressions
            .filter((node, index) => this.noOverlappingNodes(node, index, propertyAccessExpressions))
            .forEach(propertyAccessExpression => {
                if (propertyAccessExpression) {
                    let [newVarName, assignment] = variableUse.getText().split('=');
                    newVarName = newVarName.trim();
                    assignment = assignment.split('.')[1].trim();
                    let paramString = varString.concat('.', assignment);
                    changes = changes.concat(this.checkRewrite(propertyAccessExpression, paramString));
                    changes.forEach(c => console.log('we gaan hem zo herschrijven:', c.description));
                    changes = changes.concat(this.findVariableUses(functionBlockNode, newVarName, propertyAccessExpression.end, paramString));
                }
            });
        return changes;
    }

    /*
     *  Starting from functionBlockNode, find all uses of the variable contained in variableName
     *  Calls
     *  @Input - functionBlockNode: The BlockNode of this firebase function
     *  @Input - variableName: The name of the variable whose usages we are looking for
     *  @Input - startingPos: Nodes that have a pos field lower than this number should not be evaluated to prevent endless loops
     *  @Input - varString: string of accessed object properties up to this variable without variable assignment names
     *           => 'var dat = event.data; var previous = dat.previous' gives varString: 'event.data.previous'
     *  @Returns - variableDeclarations: List of nodes in which the variable contained in variableName is used
     */
    findVariableUses(functionBlockNode: ts.Node, variableName: string, startingPos: number, varString: string): Change[] {
        // Start by finding all variableStatements in this function containing the eventParamName ('event' by default)
        let changes: Change[] = [];
        const candidates = [
            tsquery(functionBlockNode, `VariableStatement:has([text=${variableName}]) VariableDeclarationList VariableDeclaration`),
            tsquery(functionBlockNode, `ExpressionStatement:has([text=${variableName}])`),
            tsquery(functionBlockNode, `IfStatement:has([text=${variableName}])`),
            tsquery(functionBlockNode, `ForStatement:has([text=${variableName}])`),
            tsquery(functionBlockNode, `WhileStatement:has([text=${variableName}])`)
        ].reduce((acc, val) => acc.concat(val), []);

        candidates
            .filter(v => v.pos > startingPos) // Filter nodes that have a position smaller than the startingPos.
            .forEach(variableUse => {
                // If we're looking at a VariableDeclaration, further recursion is required
                if(variableUse.kind === ts.SyntaxKind.VariableDeclaration) {
                    changes = changes.concat(this.handleVariableDeclaration(variableUse, varString, functionBlockNode));
                }
                else {
                    let [callExpression] = tsquery(variableUse, 'CallExpression');
                    if (callExpression) { // CallExpression, no further recursion
                        //console.log('we hebben een callExpression');
                        // ExpressionStatements can be function calls with (multiple) parameters. If call has parameters, it is dubbed an ExpressionStatement
                        if (variableUse.kind === ts.SyntaxKind.ExpressionStatement) {
                            let parameters = tsquery(variableUse, `PropertyAccessExpression:has([text=${variableName}])`);
                            parameters
                                .filter((p, index) => (index === 0 || p.end > parameters[index - 1].end))
                                .forEach(p => {
                                    let paramString = varString.concat('.').concat(p.getText().split('.').slice(1).join('.'));
                                    changes = changes.concat(this.checkRewrite(p, paramString));
                                });
                        } else { // Simple CallExpression without parameters
                            let callString = varString.concat('.').concat(callExpression.getText().split('.').slice(1).join('.'));
                            changes = changes.concat(this.checkRewrite(callExpression, callString));
                        }
                    }
                    else {
                        console.log('wat hebben we dan wel?', ts.SyntaxKind[variableUse.kind], variableUse.getText());
                    }
                }
            });
        return changes;
    }

    checkRewrite(node: ts.Node, _varString: string): Change {
        let nodeText = node.getFullText()
            .replace(`${this.eventParamName}.data`, this.eventParamNameToWrite)
            .replace(`${this.eventParamName}.params`, `context.params`)
            .replace( this.eventParamName, this.eventParamNameToWrite);
        //console.log('checkrewrite. nodetext =', nodeText, 'trigger:', this.trigger, 'event:', this.eventType, '_varString:');
        if (this.trigger === 'database') {
            if(this.eventType === 'onCreate') {

            } else if(this.eventType === 'onWrite' || this.eventType === 'onUpdate') {
                console.log('onupdate');
                nodeText = nodeText
                    .replace('previous', 'before')
                    .replace('data.val', 'data.after.val');
                console.log('achteraf is nodetext=', nodeText);
            } else if (this.eventType === 'onDelete') {
                nodeText = nodeText
                    .replace('previous.val', 'val')
                    .replace('.previous', '');
            } else {
                return new NoopChange();
            }
            return new ReplaceChange(this.path, node.pos, node.getFullText(), nodeText);
        } else if (this.trigger === 'firestore') {
            if (this.eventType === 'onCreate' || this.eventType === 'onDelete') {
                nodeText = nodeText.replace('.previous', '');
            } else if (this.eventType === 'onWrite' || this.eventType === 'onUpdate') {
                nodeText = nodeText
                    .replace('previous', 'before')
                    .replace(`${this.eventParamNameToWrite}.data`, `${this.eventParamNameToWrite}.after.data`);
            } else {
                return new NoopChange();
            }
            return new ReplaceChange(this.path, node.pos, node.getFullText(), nodeText);
        } else if (this.trigger === 'auth') {
            nodeText = nodeText
                .replace('createdAt', 'creationTime')
                .replace('lastSignedInAt', 'lastSignInTime');
            return new ReplaceChange(this.path, node.pos, node.getFullText(), nodeText);
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
    noOverlappingNodes(node: TSQueryNode, index: number, nodeList: TSQueryNode[]): boolean {
        return (index === 0 || (node.pos > nodeList[index-1].pos && node.end > nodeList[index-1].end));
    }
}