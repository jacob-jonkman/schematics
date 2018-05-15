import { AstWalker } from "./AstWalker";
import * as ts from 'typescript';

export class Traversal {
    astWalker(node: ts.Node, walkerArray: AstWalker[]) {
        let ret: ts.Node[] = [];
        for (let walker of walkerArray) {
            let nodes: ts.Node[] = [];
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

    findImmediateChildNodes(node: ts.Node, nodeType: ts.SyntaxKind, regex: RegExp): ts.Node[] {
        return node.getChildren().filter(n => n.kind === nodeType && (regex === undefined || n.getText().search(regex)));
    }

    // Starting from the current node, recursively finds all childnodes that are of type nodeType.
    // If a regex is given, it is also checked whether the node's text contains this regular expression.
    // This is done using the search() method, so an exact match is not required.
    findRecursiveChildNodes(node: ts.Node, nodeType: ts.SyntaxKind, regex?: RegExp): ts.Node[] {
        let nodes: ts.Node[] = [];
        node.getChildren().forEach(n => {
            if (n.kind === nodeType && (!regex || n.getText().search(regex) > -1)) {
                nodes.push(n);
            }
            this.findRecursiveChildNodes(n, nodeType, regex).forEach(c => nodes.push(c))
        });
        return nodes;
    }

    // Recursively traverses the syntax tree downward searching for a specific list of nodetypes.
    // The function only traverses downward when a match is found.
    findSuccessor(node: ts.Node, searchPath: ts.SyntaxKind[]) {
        let children = node.getChildren();
        let next: ts.Node | undefined;

        for (let syntaxKind of searchPath) {
            next = children.find(n => n.kind == syntaxKind);
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
            if (node.parent.kind === nodeType && (!regex || node.parent.getText().search(regex) > -1)) {
                return node.parent;
            }
            node = node.parent;
        }
        return null;
    }

    // Looks for an import statement of the form 'import <target> as <importName> from <path>'
    // importName is returned
    findImportAsName(nodes: ts.Node[], target: string, _path: string): string | null {
        let importNodes = nodes.filter(n => {
            return n.kind === ts.SyntaxKind.ImportDeclaration;
        });
        if (!importNodes) return null;
        for (let importNode of importNodes) {
            if (importNode.getFullText().search(target) > -1) {
                let importNameNode = this.findSuccessor(importNode, [
                    ts.SyntaxKind.ImportClause,
                    ts.SyntaxKind.NamespaceImport,
                    ts.SyntaxKind.Identifier
                ]);
                if (!importNameNode) {
                    return null;
                }
                return importNameNode.getText();
            }
        }
        return null;
    }
}