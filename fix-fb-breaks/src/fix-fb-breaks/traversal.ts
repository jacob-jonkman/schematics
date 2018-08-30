import * as ts from 'typescript';
import { tsquery } from '@phenomnomnominal/tsquery';
import { TSQueryNode } from '@phenomnomnominal/tsquery/dist/src/tsquery-types';
import { Change, NoopChange, ReplaceChange } from '../schematics-angular-utils/change';
import { SchematicsException } from '@angular-devkit/schematics';

export class Traversal {
    eventParamName: string;
    eventParamNameToWrite: string;
    trigger: string;
    eventType: string;
    path: string;
    previousChangePos: number;
    previousChangeEnd: number;

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

    // isInvokingVariable(node: TSQueryNode, variable: string) {
    //     .return true;//if(node.getText())
    // }

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
        const candidates: TSQueryNode[] = [
            tsquery(functionBlockNode, `VariableStatement:has([text=${variableName}]) VariableDeclarationList VariableDeclaration`),
            tsquery(functionBlockNode, `ExpressionStatement:has([text=${variableName}])`),
            tsquery(functionBlockNode, `IfStatement:has([text=${variableName}])`),
            tsquery(functionBlockNode, `ForStatement:has([text=${variableName}])`),
            tsquery(functionBlockNode, `WhileStatement:has([text=${variableName}])`)
        ].reduce((acc, val) => acc.concat(val), []);

        candidates
            .filter(v => v.pos > startingPos)// && this.isInvokingVariable(v, variableName)) // Filter nodes that have a position smaller than the startingPos.
            .forEach(candidate => {
                console.log('de volgende node is gevonden:', candidate.getText());
                // If we're looking at a VariableDeclaration, further recursion is required
                if(candidate.kind === ts.SyntaxKind.VariableDeclaration) {
                    changes = changes.concat(this.handleVariableDeclaration(candidate, varString, functionBlockNode));
                }
                // No variable declaration, no further recursion required
                else {
                    console.log('callexpression');
                    changes = changes.concat(this.handleDifferentExpressions(candidate, variableName, varString));
                }
            });
        return changes;
    }

    handleVariableDeclaration(variableUse: TSQueryNode, varString: string, functionBlockNode: ts.Node): Change[] {
        let changes: Change[] = [];
        const propertyAccessExpressions = tsquery(variableUse, 'PropertyAccessExpression');
        propertyAccessExpressions
            .filter((node, index) => this.noOverlappingNodes(node, index, propertyAccessExpressions))
            .forEach(propertyAccessExpression => {
                console.log('we hebben ook nog een variabledeclaration');
                let [newVarName, assignment] = variableUse.getText().split('=');
                newVarName = newVarName.trim();
                assignment = assignment.split('.')[1].trim();
                let paramString = varString.concat('.', assignment);
                changes = changes.concat(this.checkRewrite(propertyAccessExpression, paramString));
                changes = changes.concat(this.findVariableUses(functionBlockNode, newVarName, propertyAccessExpression.end, paramString));
            });
        return changes;
    }

    handleDifferentExpressions(variableUse: TSQueryNode, variableName: string, varString: string): Change[] {
        let changes: Change[] = [];
        // ExpressionStatements can be function calls with (multiple) parameters. If call has parameters, it is dubbed an ExpressionStatement
        let expressions = tsquery(variableUse, `PropertyAccessExpression:has([text=${variableName}])`);
        if(expressions.length === 0) {
            expressions = tsquery(variableUse, `Identifier:has([text=${variableName}])`);
        }
        expressions
            .filter((p, index) => (index === 0 || p.end > expressions[index - 1].end))
            .forEach(p => {
                let paramString = varString.concat('.').concat(p.getText().split('.').slice(1).join('.'));
                changes = changes.concat(this.checkRewrite(p, paramString));
            });
        return changes;
    }

    checkRewrite(node: ts.Node, _varString: string): Change {
        if(node.pos >= this.previousChangePos && node.end <= this.previousChangeEnd) {
            console.log(`Node valt binnen de laatst gemaakte change. Geen verdere changes nodig. Text was: '${node.getText()}'`);
            return new NoopChange();
        }
        let nodeText = node.getFullText()
            .replace(`${this.eventParamName}.data`, this.eventParamNameToWrite)
            .replace(`${this.eventParamName}.params`, `context.params`)
            .replace(this.eventParamName, this.eventParamNameToWrite);
        console.log('checkrewrite. nodetext =', nodeText, 'trigger:', this.trigger, 'event:', this.eventType, '_varString:');
        if (this.trigger === 'database') {
            if(nodeText.split('.').includes('ref')) {
                throw new SchematicsException(`Remove mention of 'ref' from file ${this.path} before running.`);
            }
            nodeText = nodeText.replace('adminRef', 'ref');
            if(this.eventType === 'onCreate') {
                nodeText = nodeText.replace('previous', 'before')
            } else if(this.eventType === 'onWrite' || this.eventType === 'onUpdate') {
                nodeText = nodeText
                    .replace('previous', 'before')
                    .replace('data.val', 'data.after.val');
            } else if (this.eventType === 'onDelete') {
                nodeText = nodeText
                    .replace('previous.val', 'val')
                    .replace('.previous', '');
            }
        } else if (this.trigger === 'firestore') {
            if (this.eventType === 'onCreate' || this.eventType === 'onDelete') {
                nodeText = nodeText.replace('.previous', '');
            } else if (this.eventType === 'onWrite' || this.eventType === 'onUpdate') {
                nodeText = nodeText
                    .replace('previous', 'before')
                    .replace(`${this.eventParamNameToWrite}.data`, `${this.eventParamNameToWrite}.after.data`);
            }
        } else if (this.trigger === 'auth') {
            nodeText = nodeText
                .replace('createdAt', 'creationTime')
                .replace('lastSignedInAt', 'lastSignInTime');
        }
        if(nodeText !== node.getText()) {
            this.previousChangeEnd = node.end;
            this.previousChangePos = node.pos;
            console.log(`we gaan ${node.getText()} herschrijven tot ${nodeText} op positie ${node.pos}\n-----------------------`);
            return new ReplaceChange(this.path, node.pos, node.getFullText(), nodeText);
        } else {
            return new NoopChange();
        }
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