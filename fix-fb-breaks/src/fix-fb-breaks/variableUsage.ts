export class VariableUsage {
    variableName: string = ''; // Name of the variable
    lastVariableNodeEnd: number; // end position of the variable declaration of this variable
    varStack: string = '';
    varUsages: string[] = []; // The individual uses of this variable
    varPositions: number[] = [];
    previousVarName: string = '';

    getVariableString(): string {
        return this.varStack;
    }

    addToVarStack(str: string) {
        let [name, vars] = str.split('=');
        this.varStack = this.varStack.concat(vars.trim().replace(this.previousVarName, ''));
        this.previousVarName = name.trim();
    }

    addVar(part: string, nodeStart: number, nodeEnd: number, toOmit?: string): void {
        if(toOmit){
            this.varUsages.push(part.replace(toOmit+'.', ''));
        } else {
            this.varUsages.push(part);
        }
        this.varPositions.push(nodeStart);
        this.lastVariableNodeEnd = nodeEnd;
    }
}