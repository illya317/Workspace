import type { FormulaExpression } from "./expression";

export function emitHyperFormulaExpression(
  expression: FormulaExpression,
  resolveField: (reference: string) => string,
): string {
  switch (expression.type) {
    case "literal":
      if (typeof expression.value === "string") return JSON.stringify(expression.value);
      if (typeof expression.value === "boolean") return expression.value ? "TRUE()" : "FALSE()";
      return String(expression.value);
    case "field":
      return resolveField(expression.reference);
    case "unary":
      if (expression.operator === "not") return `NOT(${emitHyperFormulaExpression(expression.argument, resolveField)})`;
      return `(${expression.operator}${emitHyperFormulaExpression(expression.argument, resolveField)})`;
    case "binary": {
      if (expression.operator === "and" || expression.operator === "or") {
        const name = expression.operator === "and" ? "AND" : "OR";
        return `${name}(${emitHyperFormulaExpression(expression.left, resolveField)},${emitHyperFormulaExpression(expression.right, resolveField)})`;
      }
      const operator = expression.operator === "!=" ? "<>" : expression.operator;
      return `(${emitHyperFormulaExpression(expression.left, resolveField)}${operator}${emitHyperFormulaExpression(expression.right, resolveField)})`;
    }
    case "call":
      if (expression.functionName === "DIFF" || expression.functionName === "NET") {
        return `(${emitHyperFormulaExpression(expression.args[0], resolveField)}-${emitHyperFormulaExpression(expression.args[1], resolveField)})`;
      }
      if (expression.functionName === "RATIO") {
        return `(${emitHyperFormulaExpression(expression.args[0], resolveField)}/${emitHyperFormulaExpression(expression.args[1], resolveField)})`;
      }
      if (expression.functionName === "LOSS_RATE") {
        const base = emitHyperFormulaExpression(expression.args[0], resolveField);
        const after = emitHyperFormulaExpression(expression.args[1], resolveField);
        return `((${base}-${after})/${base}*100)`;
      }
      if (expression.functionName === "UPPER") {
        return `(${emitHyperFormulaExpression(expression.args[0], resolveField)}*(1+${emitHyperFormulaExpression(expression.args[1], resolveField)}/100))`;
      }
      if (expression.functionName === "LOWER") {
        return `(${emitHyperFormulaExpression(expression.args[0], resolveField)}*(1-${emitHyperFormulaExpression(expression.args[1], resolveField)}/100))`;
      }
      return `${expression.functionName}(${expression.args.map((arg) => emitHyperFormulaExpression(arg, resolveField)).join(",")})`;
  }
}
