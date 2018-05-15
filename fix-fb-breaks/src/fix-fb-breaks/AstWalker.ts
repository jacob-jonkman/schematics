import * as ts from 'typescript';

export class AstWalker {
    nodeType: ts.SyntaxKind;
    nodeText: RegExp;
    optional: boolean;
    immediate: boolean;
    returnNode: boolean;
    maxDepth: number;
}