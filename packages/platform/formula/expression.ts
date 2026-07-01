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

export type SupportedFormulaFunction =
  | "ABS"
  | "SQRT"
  | "ROUND"
  | "MAX"
  | "MIN"
  | "AVG"
  | "AVERAGE"
  | "MEAN"
  | "SD"
  | "STDEV"
  | "RD"
  | "RSD"
  | "DIFF"
  | "NET"
  | "RATIO"
  | "LOSS_RATE"
  | "UPPER"
  | "LOWER";

export const SUPPORTED_FUNCTIONS = new Set<SupportedFormulaFunction>([
  "ABS",
  "SQRT",
  "ROUND",
  "MAX",
  "MIN",
  "AVG",
  "AVERAGE",
  "MEAN",
  "SD",
  "STDEV",
  "RD",
  "RSD",
  "DIFF",
  "NET",
  "RATIO",
  "LOSS_RATE",
  "UPPER",
  "LOWER",
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

export function validateFormulaFunctionArguments(
  expression: FormulaExpression,
  isInputReference: (reference: string) => boolean = isInputAlias,
) {
  visitExpression(expression, (node) => {
    if (node.type !== "call" || !isInputOnlyFunction(node.functionName)) return;
    for (const arg of node.args) {
      if (arg.type !== "field" || !isInputReference(arg.reference)) {
        throw new FormulaParseError("invalid_expression", `${node.functionName} only accepts x/y/z/p inputs.`, node.functionName);
      }
    }
  });
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
    .replace(/^[=＝]/, "")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=")
    .replace(/×/g, "*")
    .replace(/[÷／]/g, "/")
    .replace(/，/g, ",")
    .replace(/[－﹣]/g, "-")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/(\d+(?:\.\d+)?)\s*%$/u, "$1");
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

function isInputOnlyFunction(functionName: SupportedFormulaFunction) {
  return (
    functionName === "AVG"
    || functionName === "AVERAGE"
    || functionName === "MEAN"
    || functionName === "SD"
    || functionName === "STDEV"
    || functionName === "RD"
    || functionName === "RSD"
    || functionName === "DIFF"
    || functionName === "NET"
    || functionName === "RATIO"
    || functionName === "LOSS_RATE"
    || functionName === "UPPER"
    || functionName === "LOWER"
  );
}

function isInputAlias(reference: string) {
  return /^[xypz]\d+$/i.test(reference.trim());
}
