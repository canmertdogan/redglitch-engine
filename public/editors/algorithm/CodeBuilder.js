export class CodeBuilder {
    constructor() { this.code = ""; this.indentLvl = 0; }

    line(str) { this.code += "  ".repeat(this.indentLvl) + str + "\n"; }
    in() { this.indentLvl++; }
    out() { if(this.indentLvl > 0) this.indentLvl--; }
    toString() { return this.code; }
}
