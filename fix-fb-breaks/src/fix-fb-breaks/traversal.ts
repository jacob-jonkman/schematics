import { AstWalker } from "./AstWalker";
//import * as ts from 'typescript';
import { Node as tsNode, SyntaxKind} from 'typescript';
import { tsquery } from '@phenomnomnominal/tsquery';
import { TSQueryNode } from '@phenomnomnominal/tsquery/dist/src/tsquery-types';
// import * as utils from 'tsutils';
// import {isPropertyAccessExpression} from "typescript";

export class Traversal {
    astWalker(node: tsNode, walkerArray: AstWalker[]) {
        let ret: tsNode[] = [];
        for (let walker of walkerArray) {
            let nodes: tsNode[] = [];
            if (walker.immediate) {
                nodes = this.findImmediateChildNodes(node, walker.nodeType, walker.nodeText);
            } else {
                nodes = this.findRecursiveChildNodes(node, walker.nodeType, walker.nodeText);
            }
            if (nodes) {
                nodes.forEach(n => ret.push(n));
            }
        }
        return ret;
    }

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

    findImmediateChildNodes(node: tsNode, nodeType: SyntaxKind, regex: RegExp): tsNode[] {
        return node.getChildren().filter(n => this.nodeIsOfType(n, nodeType) && (regex === undefined || n.getText().search(regex)));
    }

    // Starting from the current node, recursively finds all childnodes that are of type nodeType.
    // If a regex is given, it is also checked whether the node's text contains this regular expression.
    // This is done using the search() method, so an exact match is not required.
    findRecursiveChildNodes(node: tsNode, nodeType: SyntaxKind, regex?: RegExp): tsNode[] {
        let nodes: tsNode[] = [];
        node.getChildren().forEach(n => {
            if (this.nodeIsOfType(n, nodeType) && (!regex || this.nodeContainsString(n, regex))) {
                nodes.push(n);
            }
            this.findRecursiveChildNodes(n, nodeType, regex).forEach(c => nodes.push(c))
        });
        return nodes;
    }

    // Recursively traverses the syntax tree downward searching for a specific list of nodetypes.
    // The function only traverses downward when a match is found.
    findSuccessor(node: TSQueryNode, searchPath: SyntaxKind[]): TSQueryNode | null | undefined {
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
    findParentNode(node: tsNode, nodeType: SyntaxKind, regex?: RegExp): tsNode | null {
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
    findImportAsName(ast: string, importPath: string): string| null {
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

    nodeIsOfType(node: tsNode, kind: SyntaxKind ): boolean {
        return node.kind === kind;
    }
    nodeContainsString(node: tsNode, string: string|RegExp): boolean {
        return node.getText().search(string) > -1;
    }
}