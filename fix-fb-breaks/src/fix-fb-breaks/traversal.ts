//import { AstWalker } from './AstWalker';
//import * as ts from 'typescript';
import * as ts from 'typescript';
import { tsquery } from '@phenomnomnominal/tsquery';
import { TSQueryNode } from '@phenomnomnominal/tsquery/dist/src/tsquery-types';
// import * as utils from 'tsutils';

//export class Traversal {
// export function astWalker(node: tsNode, walkerArray: AstWalker[]) {
//         let ret: tsNode[] = [];
//         for (let walker of walkerArray) {
//             let nodes: tsNode[] = [];
//             if (walker.immediate) {
//                 nodes = findImmediateChildNodes(node, walker.nodeType, walker.nodeText);
//             } else {
//                 nodes = findRecursiveChildNodes(node, walker.nodeType, walker.nodeText);
//             }
//             if (nodes) {
//                 nodes.forEach(n => ret.push(n));
//             }
//         }
//         return ret;
//     }

    // Finds the uses of the variable declared in node
    // Only the current scope is checked by finding the first parent SyntaxList
    // findVariableUses(node: ts.Node, varName: string): ts.Node[] {
    //     let usages: ts.Node[] = [];
    //     const parentNode: ts.Node|null = this.findParentNode(node, ts.SyntaxKind.SyntaxList);
    //     if(parentNode) {
    //
    //     }
    //     return usages;
    // }

export function findImmediateChildNodes(node: ts.Node, nodeType: ts.SyntaxKind, regex: RegExp): ts.Node[] {
    return node.getChildren().filter(n => nodeIsOfType(n, nodeType) && (regex === undefined || n.getText().search(regex)));
}

// Starting from the current node, recursively finds all childnodes that are of type nodeType.
// If a regex is given, it is also checked whether the node's text contains this regular expression.
// This is done using the search() method, so an exact match is not required.
export function findRecursiveChildNodes(node: ts.Node, nodeType: ts.SyntaxKind, regex?: RegExp): ts.Node[] {
    let nodes: ts.Node[] = [];
    node.getChildren().forEach(n => {
        if (nodeIsOfType(n, nodeType) && (!regex || nodeContainsString(n, regex))) {
            nodes.push(n);
        }
        findRecursiveChildNodes(n, nodeType, regex).forEach(c => nodes.push(c))
    });
    return nodes;
}

/*
    Starting from functionBlockNode, find all uses of the variable contained in variableName
    @Input - functionBlockNode: The BlockNode of this firebase function
    @Input - variableName: The name of the variable whose usages we are looking for
    @Input - startingPos: Nodes that have a pos field lower than this number should not be evaluated to prevent endless loops
    @Returns - variableDeclarations: List of nodes in which the variable contained in variableName is used
 */
export function findVariableUses(functionBlockNode: ts.Node, variableName: string, startingPos: number, varString: string): TSQueryNode[] {
    // Start by finding all variableStatements in this function containing the eventParamName ('event' by default)
    let variableDeclarations = tsquery(functionBlockNode, `VariableStatement:has([text=${variableName}]) VariableDeclarationList VariableDeclaration`);
    let variableStatements: TSQueryNode[] = [];

    variableDeclarations
        .filter(v => v.pos > startingPos) // Filter nodes that have a position less than the startingPos.
        .forEach(variableDeclaration => {
            // CallExpressions zijn endpoints voor de recursie. VariableDeclarations zijn dat niet
            let [callExpression] = tsquery(variableDeclaration,  'CallExpression PropertyAccessExpression');
            if(callExpression) {
                variableStatements.push(callExpression);
            } else {
                let propertyAccessExpressions = tsquery(variableDeclaration, 'PropertyAccessExpression');
                propertyAccessExpressions.forEach(propertyAccessExpression => {
                    if (propertyAccessExpression) {
                        let [newVarName, assignment] = variableDeclaration.getText().split('=');
                        newVarName = newVarName.trim();
                        assignment = assignment.split('.')[1].trim();
                        variableStatements.push(propertyAccessExpression);
                        variableStatements = variableStatements.concat(findVariableUses(functionBlockNode, newVarName, variableDeclaration.pos, varString.concat('.').concat(assignment)));
                    }
                });
            }
        });
    return variableStatements;
}
// Recursively traverses the syntax tree downward searching for a specific list of nodetypes.
// The function only traverses downward when a match is found.
export function findSuccessor(node: TSQueryNode, searchPath: ts.SyntaxKind[]): TSQueryNode | null | undefined {
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
export function findParentNode(node: ts.Node, nodeType: ts.SyntaxKind, regex?: RegExp): ts.Node | null {
    while (node.parent) {
        if (nodeIsOfType(node.parent, nodeType) && (!regex || nodeContainsString(node.parent, regex))) {
            return node.parent;
        }
        node = node.parent;
    }
    return null;
}

// Looks for an import statement of the form 'import <package> as <importName> from <importPath>'
// importName is returned if it exists
export function findImportAsName(ast: ts.SourceFile, importPath: string): string| null {
    const [importDeclaration] = tsquery(ast, `ImportDeclaration:has([text="${importPath}"])`);
    return importDeclaration ? tsquery(importDeclaration, 'Identifier')[0].getText() : null;
}

    //
    // findRecursiveVariableDeclarations(node: Node, searchString: string): Node[] {
    //     let returnNodes: Node[] = [];
    //     if( this.nodeContainsString(node, searchString)) {
    //         console.log('wow recursief man', node.getText(), 'we zoeken naar node met syntaxkind:', node.kind, 'en text:', searchString);
    //         if( node.kind === SyntaxKind.VariableDeclaration ) {
    //             returnNodes.push(node);
    //         }
    //         else {
    //             node.getChildren().forEach(c => {
    //                 this.findRecursiveVariableDeclarations(c, searchString).forEach(n => returnNodes.push(n));
    //             });
    //         }
    //     }
    //     return returnNodes;
    // }

export function nodeIsOfType(node: ts.Node, kind: ts.SyntaxKind ): boolean {
    return node.kind === kind;
}
export function nodeContainsString(node: ts.Node, string: string|RegExp): boolean {
    return node.getText().search(string) > -1;
}
//}