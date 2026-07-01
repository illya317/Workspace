import { FormulaParseError, type FormulaExpression } from "./expression";
import type { FormulaField, FormulaValue } from "./types";

export const FORMULA_ALIAS_PATTERN = /^[xypz]\d+$/i;

export function isFormulaAlias(value: string) {
  return FORMULA_ALIAS_PATTERN.test(value.trim());
}

export function durationUnit(field: Pick<FormulaField, "inputType" | "valueType"> | undefined): "days" | "hours" | null {
  const value = field?.valueType ?? field?.inputType;
  if (value === "duration_days") return "days";
  if (value === "duration_hours") return "hours";
  return null;
}

export function validateDateDifferenceExpression(expression: FormulaExpression) {
  const refs = dateDifferenceReferences(expression);
  if (!refs) {
    throw new FormulaParseError("invalid_expression", "Date duration formula only accepts a-b.");
  }
  return refs;
}

export function evaluateDateDifferenceExpression(
  expression: FormulaExpression,
  resolveField: (reference: string) => FormulaValue,
  unit: "days" | "hours",
): number {
  const refs = validateDateDifferenceExpression(expression);
  const left = dateTimeMs(resolveField(refs.left));
  const right = dateTimeMs(resolveField(refs.right));
  const hours = (left - right) / (1000 * 60 * 60);
  return unit === "hours" ? hours : hours / 24;
}

function dateDifferenceReferences(expression: FormulaExpression) {
  if (expression.type !== "binary" || expression.operator !== "-") return null;
  if (expression.left.type !== "field" || expression.right.type !== "field") return null;
  const left = expression.left.reference.trim();
  const right = expression.right.reference.trim();
  if (!isFormulaAlias(left) || !isFormulaAlias(right)) return null;
  return { left, right };
}

function dateTimeMs(value: FormulaValue) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4}|\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!match) throw new FormulaParseError("invalid_expression", `Value "${text}" cannot be used as a date.`);
  const rawYear = Number(match[1]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const timestamp = new Date(year, month - 1, day, hour, minute).getTime();
  if (!Number.isFinite(timestamp)) throw new FormulaParseError("invalid_expression", `Value "${text}" cannot be used as a date.`);
  return timestamp;
}
