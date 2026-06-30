import type { FormulaErrorType, FormulaField, FormulaValue } from "./types";

export type FormulaExpression =
  | { type: "literal"; value: Exclude<FormulaValue, null> }
  | { type: "field"; reference: string }
  | { type: "unary"; operator: "-" | "+" | "not"; argument: FormulaExpression }
  | { type: "binary"; operator: BinaryOperator; left: FormulaExpression; right: FormulaExpression }
  | { type: "call"; functionName: SupportedFormulaFunction; args: FormulaExpression[] };

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "^"
  | "<"
  | "<="
  | ">"
  | ">="
  | "="
  | "!="
  | "and"
  | "or";

export type SupportedFormulaFunction = "ABS" | "SQRT" | "ROUND" | "MAX" | "MIN" | "RSD";

export const SUPPORTED_FUNCTIONS = new Set<SupportedFormulaFunction>([
  "ABS",
  "SQRT",
  "ROUND",
  "MAX",
  "MIN",
  "RSD",
]);

export class FormulaParseError extends Error {
  readonly errorType: FormulaErrorType;
  readonly functionName?: string;

  constructor(errorType: FormulaErrorType, message: string, functionName?: string) {
    super(message);
    this.errorType = errorType;
    this.functionName = functionName;
  }
}

export function collectFormulaReferences(expression: FormulaExpression): string[] {
  const refs = new Set<string>();
  visitExpression(expression, (node) => {
    if (node.type === "field") refs.add(node.reference);
  });
  return [...refs];
}

export function createReferenceCatalog(fields: FormulaField[]) {
  const map = new Map<string, string>();
  for (const field of fields) {
    addReferenceName(map, field.fieldKey, field.fieldKey);
    if (field.label) addReferenceName(map, field.label, field.fieldKey);
    for (const alias of field.aliases ?? []) addReferenceName(map, alias, field.fieldKey);
  }
  return {
    resolve(reference: string) {
      return map.get(reference) ?? null;
    },
  };
}

export function normalizeFormulaText(expression: string) {
  return expression
    .trim()
    .replace(/^=/, "")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=")
    .replace(/（/g, "(")
    .replace(/）/g, ")");
}

export function normalizeComparisonOperator(operator: string): BinaryOperator {
  if (operator === "==" || operator === "=") return "=";
  if (operator === "<>") return "!=";
  return operator as BinaryOperator;
}

function visitExpression(expression: FormulaExpression, visitor: (node: FormulaExpression) => void) {
  visitor(expression);
  if (expression.type === "unary") visitExpression(expression.argument, visitor);
  if (expression.type === "binary") {
    visitExpression(expression.left, visitor);
    visitExpression(expression.right, visitor);
  }
  if (expression.type === "call") {
    for (const arg of expression.args) visitExpression(arg, visitor);
  }
}

function addReferenceName(map: Map<string, string>, name: string, fieldKey: string) {
  const trimmed = name.trim();
  if (trimmed && !map.has(trimmed)) map.set(trimmed, fieldKey);
}
