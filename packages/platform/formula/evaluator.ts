import type { FormulaValue } from "./types";
import { FormulaParseError, type BinaryOperator, type FormulaExpression, type SupportedFormulaFunction } from "./expression";

export function evaluateFormulaExpression(
  expression: FormulaExpression,
  resolveField: (reference: string) => FormulaValue,
): FormulaValue {
  switch (expression.type) {
    case "literal":
      return expression.value;
    case "field":
      return resolveField(expression.reference);
    case "unary":
      return evaluateUnary(expression.operator, evaluateFormulaExpression(expression.argument, resolveField));
    case "binary":
      return evaluateBinary(
        expression.operator,
        evaluateFormulaExpression(expression.left, resolveField),
        evaluateFormulaExpression(expression.right, resolveField),
      );
    case "call":
      return evaluateCall(
        expression.functionName,
        expression.args.map((arg) => evaluateFormulaExpression(arg, resolveField)),
      );
  }
}

function evaluateUnary(operator: "+" | "-" | "not", value: FormulaValue): FormulaValue {
  if (operator === "not") return !toBoolean(value);
  const numeric = toNumber(value);
  return operator === "-" ? -numeric : numeric;
}

function evaluateBinary(operator: BinaryOperator, left: FormulaValue, right: FormulaValue): FormulaValue {
  if (operator === "and") return toBoolean(left) && toBoolean(right);
  if (operator === "or") return toBoolean(left) || toBoolean(right);

  if (["<", "<=", ">", ">=", "=", "!="].includes(operator)) {
    return compareValues(operator, left, right);
  }

  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);
  switch (operator) {
    case "+":
      return leftNumber + rightNumber;
    case "-":
      return leftNumber - rightNumber;
    case "*":
      return leftNumber * rightNumber;
    case "/":
      if (rightNumber === 0) throw new FormulaParseError("invalid_expression", "Division by zero.");
      return leftNumber / rightNumber;
    case "%":
      if (rightNumber === 0) throw new FormulaParseError("invalid_expression", "Modulo by zero.");
      return leftNumber % rightNumber;
    case "^":
      return Math.pow(leftNumber, rightNumber);
    default:
      throw new FormulaParseError("invalid_expression", `Invalid operator "${operator}".`);
  }
}

function evaluateCall(functionName: SupportedFormulaFunction, args: FormulaValue[]): FormulaValue {
  const numbers = args.map(toNumber);
  switch (functionName) {
    case "ABS":
      expectArgCount(functionName, numbers, 1, 1);
      return Math.abs(numbers[0]);
    case "SQRT":
      expectArgCount(functionName, numbers, 1, 1);
      if (numbers[0] < 0) throw new FormulaParseError("invalid_expression", "SQRT received a negative value.");
      return Math.sqrt(numbers[0]);
    case "ROUND": {
      expectArgCount(functionName, numbers, 1, 2);
      const digits = numbers[1] ?? 0;
      const factor = Math.pow(10, digits);
      return Math.round(numbers[0] * factor) / factor;
    }
    case "MAX":
      expectArgCount(functionName, numbers, 1);
      return Math.max(...numbers);
    case "MIN":
      expectArgCount(functionName, numbers, 1);
      return Math.min(...numbers);
    case "AVG":
    case "AVERAGE":
    case "MEAN":
      expectArgCount(functionName, numbers, 1);
      return calculateAverage(numbers);
    case "RD":
      expectArgCount(functionName, numbers, 2, 2);
      return calculateRd(numbers);
    case "RSD":
      expectArgCount(functionName, numbers, 1);
      return calculateRsd(numbers);
    case "DIFF":
    case "NET":
      expectArgCount(functionName, numbers, 2, 2);
      return numbers[0] - numbers[1];
    case "RATIO":
      expectArgCount(functionName, numbers, 2, 2);
      if (numbers[1] === 0) throw new FormulaParseError("invalid_expression", "RATIO denominator is zero.");
      return numbers[0] / numbers[1];
    case "LOSS_RATE":
      expectArgCount(functionName, numbers, 2, 2);
      if (numbers[0] === 0) throw new FormulaParseError("invalid_expression", "LOSS_RATE denominator is zero.");
      return ((numbers[0] - numbers[1]) / numbers[0]) * 100;
    case "UPPER":
      expectArgCount(functionName, numbers, 2, 2);
      return numbers[0] * (1 + numbers[1] / 100);
    case "LOWER":
      expectArgCount(functionName, numbers, 2, 2);
      return numbers[0] * (1 - numbers[1] / 100);
  }
}

function compareValues(operator: BinaryOperator, left: FormulaValue, right: FormulaValue): boolean {
  const leftNumber = maybeNumber(left);
  const rightNumber = maybeNumber(right);
  const numeric = leftNumber != null && rightNumber != null;
  const a = numeric ? leftNumber : normalizeComparable(left);
  const b = numeric ? rightNumber : normalizeComparable(right);

  switch (operator) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    default:
      throw new FormulaParseError("invalid_expression", `Invalid comparison operator "${operator}".`);
  }
}

function calculateRsd(numbers: number[]) {
  if (numbers.length < 2) return 0;
  const mean = calculateAverage(numbers);
  if (mean === 0) throw new FormulaParseError("invalid_expression", "RSD mean is zero.");
  const variance = numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (numbers.length - 1);
  return (Math.sqrt(variance) / Math.abs(mean)) * 100;
}

function calculateAverage(numbers: number[]) {
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function calculateRd(numbers: number[]) {
  const [left, right] = numbers;
  const denominator = calculateAverage([left, right]);
  if (denominator === 0) throw new FormulaParseError("invalid_expression", "RD denominator is zero.");
  return (Math.abs(left - right) / Math.abs(denominator)) * 100;
}

function expectArgCount(functionName: string, args: unknown[], min: number, max = Number.POSITIVE_INFINITY) {
  if (args.length < min || args.length > max) {
    throw new FormulaParseError("invalid_expression", `${functionName} received an invalid argument count.`, functionName);
  }
}

function toNumber(value: FormulaValue): number {
  const numeric = maybeNumber(value);
  if (numeric == null) throw new FormulaParseError("invalid_expression", `Value "${String(value)}" cannot be used as a number.`);
  return numeric;
}

function maybeNumber(value: FormulaValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function toBoolean(value: FormulaValue): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (/^true$/i.test(value.trim())) return true;
    if (/^false$/i.test(value.trim())) return false;
    return value.trim() !== "";
  }
  return false;
}

function normalizeComparable(value: FormulaValue) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value ?? "");
}
