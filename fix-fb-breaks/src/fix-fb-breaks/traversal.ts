//import { AstWalker } from './AstWalker';
//import * as ts from 'typescript';
import * as myts from 'typescript';
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

export function findImmediateChildNodes(node: myts.Node, nodeType: myts.SyntaxKind, regex: RegExp): myts.Node[] {
    return node.getChildren().filter(n => nodeIsOfType(n, nodeType) && (regex === undefined || n.getText().search(regex)));
}

// Starting from the current node, recursively finds all childnodes that are of type nodeType.
// If a regex is given, it is also checked whether the node's text contains this regular expression.
// This is done using the search() method, so an exact match is not required.
export function findRecursiveChildNodes(node: myts.Node, nodeType: myts.SyntaxKind, regex?: RegExp): myts.Node[] {
    let nodes: myts.Node[] = [];
    node.getChildren().forEach(n => {
        if (nodeIsOfType(n, nodeType) && (!regex || nodeContainsString(n, regex))) {
            nodes.push(n);
        }
        findRecursiveChildNodes(n, nodeType, regex).forEach(c => nodes.push(c))
    });
    return nodes;
}

// Recursively traverses the syntax tree downward searching for a specific list of nodetypes.
// The function only traverses downward when a match is found.
export function findSuccessor(node: TSQueryNode, searchPath: myts.SyntaxKind[]): TSQueryNode | null | undefined {
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
export function findParentNode(node: myts.Node, nodeType: myts.SyntaxKind, regex?: RegExp): myts.Node | null {
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
export function findImportAsName(ast: myts.SourceFile, importPath: string): string| null {
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

export function nodeIsOfType(node: myts.Node, kind: myts.SyntaxKind ): boolean {
    return node.kind === kind;
}
export function nodeContainsString(node: myts.Node, string: string|RegExp): boolean {
    return node.getText().search(string) > -1;
}
//}