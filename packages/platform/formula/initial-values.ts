import type { FormulaField, FormulaValue } from "./types";

export function createInitialFormulaValues(
  fields: FormulaField[],
  overrides?: Record<string, FormulaValue | undefined>,
) {
  const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
  const values: Record<string, FormulaValue> = {};
  for (const field of fields) {
    if (field.value !== undefined) values[field.fieldKey] = normalizeFormulaInputValue(field, field.value);
  }
  for (const [fieldKey, value] of Object.entries(overrides ?? {})) {
    if (value !== undefined) values[fieldKey] = normalizeFormulaInputValue(fieldByKey.get(fieldKey), value);
  }
  return values;
}

function normalizeFormulaInputValue(field: FormulaField | undefined, value: FormulaValue) {
  if (field?.formula || field?.formulaInputMode !== "percent") return value;
  if (typeof value === "number") return Number.isFinite(value) ? percentRatio(value) : value;
  if (typeof value !== "string") return value;
  const text = value.trim().replace(/%$/, "").trim();
  const numeric = Number(text);
  return Number.isFinite(numeric) ? percentRatio(numeric) : value;
}

function percentRatio(value: number) {
  return Number((value / 100).toPrecision(15));
}
