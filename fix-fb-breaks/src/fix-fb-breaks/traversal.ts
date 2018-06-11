import { AstWalker } from "./AstWalker";
import { Node, SyntaxKind } from 'typescript';
// import * as utils from 'tsutils';
// import {isPropertyAccessExpression} from "typescript";

export class Traversal {
    astWalker(node: Node, walkerArray: AstWalker[]) {
        let ret: Node[] = [];
        for (let walker of walkerArray) {
            let nodes: Node[] = [];
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

    findImmediateChildNodes(node: Node, nodeType: SyntaxKind, regex: RegExp): Node[] {
        return node.getChildren().filter(n => this.nodeIsOfType(n, nodeType) && (regex === undefined || n.getText().search(regex)));
    }

    // Starting from the current node, recursively finds all childnodes that are of type nodeType.
    // If a regex is given, it is also checked whether the node's text contains this regular expression.
    // This is done using the search() method, so an exact match is not required.
    findRecursiveChildNodes(node: Node, nodeType: SyntaxKind, regex?: RegExp): Node[] {
        let nodes: Node[] = [];
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
    findSuccessor(node: Node, searchPath: SyntaxKind[]) {
        let children = node.getChildren();
        let next: Node | undefined;

        for (let syntaxKind of searchPath) {
            next = children.find(n => this.nodeIsOfType(n, syntaxKind));
            if (!next) return null;
            children = next.getChildren();
        }
        return next;
    }

    // Traverses upwards through the syntaxtree looking for a parent node of type nodeType.
    // If a regex is given, it is also checked whether the parent node's text contains this regular expression.
    // This is done using the search() method, so an exact match is not required.
    // If no match is found, null is returned.
    findParentNode(node: Node, nodeType: SyntaxKind, regex?: RegExp): Node | null {
        while (node.parent) {
            if (this.nodeIsOfType(node.parent, nodeType) && (!regex || this.nodeContainsString(node.parent, regex))) {
                return node.parent;
            }
            node = node.parent;
        }
        return null;
    }

    // Looks for an import statement of the form 'import <target> as <importName> from <path>'
    // importName is returned
    findImportAsName(nodes: Node[], target: string, _path: string): string | null {
        let importNodes = nodes.filter(n => {
            return this.nodeIsOfType(n, SyntaxKind.ImportDeclaration);
        });
        if (!importNodes) return null;
        for (let importNode of importNodes) {
            if (importNode.getFullText().search(target) > -1) {
                let importNameNode = this.findSuccessor(importNode, [
                    SyntaxKind.ImportClause,
                    SyntaxKind.NamespaceImport,
                    SyntaxKind.Identifier
                ]);
                if (!importNameNode) {
                    return null;
                }
                return importNameNode.getText();
            }
        }
        return null;
    }

    // Look for variable assignments of searchString.
    // assignments should be nodes of type PropertyAccessExpression
    // findVariableDeclarations(assignments: Node[], searchString: string): Node[] {
        // console.log('findVariableDeclarations. Searching for:', searchString);
        // let matches: Node[] = [];
        // for( let assignment of assignments) {

    //         if( !isPropertyAccessExpression(assignment)) {
    //             console.log('ik ben een', assignment.kind.toString());
    //             continue;
    //         }

    //        if( this.nodeContainsString(assignment, searchString) && assignment.parent && this.nodeIsOfType(assignment.parent, SyntaxKind.VariableDeclaration)) {
    //             let node = assignment.parent.getChildren().find(n => this.nodeIsOfType(n, SyntaxKind.Identifier));
    //             if( node ) {
    //                 console.log('nieuwe match gevonden!', node.getText());
    //                 matches.push(node);
    //                 if(node.parent)
    //                     this.findRecursiveVariableDeclarations(node.parent, node.getText()).forEach(s => matches.push(s));
    //             }
    //        }
    //    }
    //     // console.log(matches.length);
    //    return matches;
    //}
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

    nodeIsOfType(node: Node, kind: SyntaxKind ) {
        return node.kind === kind;
    }
    nodeContainsString(node: Node, string: string|RegExp): boolean {
        return node.getText().search(string) > -1
    }
}