"use client";

import { useCallback, useMemo, useState } from "react";
import { createFormulaEngine, type FormulaField, type FormulaValue } from "@workspace/platform/formula";
import type { EditorDocument, EditorInline, EditorSlotInline, FieldDefinition, FieldModel, FormulaDefinition } from "@workspace/platform/document-editor";

export type EditorRuntimeValues = Record<string, string>;

function fieldEntries(fieldModel: FieldModel): Array<[string, FieldDefinition]> {
  if (Array.isArray(fieldModel.fields)) {
    return fieldModel.fields.map((field, index) => [field.fieldKey ?? field.key ?? `field_${index + 1}`, field]);
  }
  return Object.entries(fieldModel.fields);
}

function formulaEntries(fieldModel: FieldModel): Array<[string, FormulaDefinition]> {
  return Object.entries(fieldModel.formulas ?? {});
}

function slotEntries(document: EditorDocument): Array<[string, EditorSlotInline]> {
  const entries: Array<[string, EditorSlotInline]> = [];
  walkInlines(document, (part) => entries.push([part.fieldKey, part]));
  return entries;
}

function toFormulaValue(value: string | undefined, valueType?: string, hour?: string): FormulaValue | undefined {
  if (value == null || value === "") return undefined;
  if (valueType === "datetime") return `${value} ${String(hour || "0").padStart(2, "0")}:00`;
  if (valueType === "boolean") return value === "true" || value === "是" || value === "符合" || value === "符合要求" || value === "有" || value === "检出";
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function displayValue(value: FormulaValue | undefined, field?: FormulaField) {
  if (value == null) return "";
  if (typeof value === "number") return formatNumberValue(value, field);
  if (typeof value === "boolean") return value ? "符合" : "不符合";
  return String(value);
}

function aliases(fieldKey: string, field?: FieldDefinition, formula?: FormulaDefinition, slot?: EditorSlotInline) {
  return Array.from(new Set([
    slot?.alias,
    field?.alias,
    formula?.alias,
    fieldKey,
    field?.fieldKey,
    field?.key,
    field?.name,
    field?.label,
    slot?.label,
    fieldKey.split("/").at(-1),
  ].filter((value): value is string => Boolean(value))));
}

function initialValues(fieldModel: FieldModel, document: EditorDocument, saved: EditorRuntimeValues) {
  const next = { ...saved };
  const fields = new Map(fieldEntries(fieldModel));
  for (const [fieldKey, slot] of slotEntries(document)) {
    const field = fields.get(fieldKey);
    const defaultValue = slot.defaultValue ?? field?.defaultValue;
    if (next[fieldKey] == null && defaultValue != null) next[fieldKey] = defaultValue;
  }
  return next;
}

function formulaFields(fieldModel: FieldModel, document: EditorDocument, values: EditorRuntimeValues): FormulaField[] {
  const fields = new Map(fieldEntries(fieldModel));
  const formulas = new Map(formulaEntries(fieldModel));
  const slots = new Map(slotEntries(document));
  const keys = new Set([...fields.keys(), ...formulas.keys(), ...slots.keys()]);
  return [...keys].map((fieldKey) => {
    const field = fields.get(fieldKey);
    const formula = formulas.get(fieldKey);
    const slot = slots.get(fieldKey);
    const valueType = slot?.valueType ?? formula?.valueType ?? field?.valueType ?? inferredValueType(slot, field);
    const valueKey = slot?.referenceFieldKey ?? fieldKey;
    return {
      fieldKey,
      label: slot?.label ?? field?.label ?? field?.name ?? fieldKey,
      aliases: aliases(fieldKey, field, formula, slot),
      formula: slot?.formulaText ?? formula?.formulaText ?? formula?.rule ?? field?.formula ?? null,
      value: toFormulaValue(values[valueKey], valueType, values[`${valueKey}_hour`]),
      valueType,
      inputType: normalizedInputType(slot?.inputType ?? field?.inputType, slot?.options ?? field?.options),
      numberFormat: slot?.numberFormat ?? formula?.numberFormat ?? field?.numberFormat,
      precision: slot?.precision ?? formula?.precision ?? field?.precision,
      attr: field?.attr,
      slotKind: slot?.slotKind ?? formula?.slotKind ?? field?.slotKind,
    };
  });
}

function normalizedInputType(value?: string, options?: string[]) {
  if (value === "number") return "text";
  if (value === "field") return options?.length ? "select" : "text";
  if (value === "boolean") return "radio";
  return value;
}

function inferredValueType(slot?: EditorSlotInline, field?: FieldDefinition) {
  if (slot?.withTime || slot?.inputType === "datetime") return "datetime";
  if (slot?.type === "dateSlot" || slot?.inputType === "date" || field?.type === "date") return "date";
  if (slot?.inputType === "boolean" || field?.inputType === "boolean" || field?.type === "boolean") return "boolean";
  if (slot?.inputType === "checkbox" || field?.inputType === "checkbox") return "array";
  if (slot?.inputType === "number" || field?.inputType === "number") return "number";
  return field?.type;
}

function computeValues(fieldModel: FieldModel, document: EditorDocument, values: EditorRuntimeValues) {
  const fields = formulaFields(fieldModel, document, values);
  const targetFieldKeys = fields.filter((field) => field.formula).map((field) => field.fieldKey);
  if (!targetFieldKeys.length) return values;
  const engine = createFormulaEngine();
  const result = engine.evaluate({
    model: { fields },
    values: Object.fromEntries(fields.map((field) => [field.fieldKey, field.value ?? toFormulaValue(values[field.fieldKey], field.valueType, values[`${field.fieldKey}_hour`])])),
    targetFieldKeys,
  });
  const next = { ...values };
  const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
  for (const fieldKey of targetFieldKeys) {
    const rendered = displayValue(result.values[fieldKey], fieldByKey.get(fieldKey));
    if (rendered) next[fieldKey] = rendered;
  }
  return next;
}

function formatNumberValue(value: number, field?: FormulaField) {
  if (!Number.isFinite(value)) return "";
  const precision = normalizedPrecision(field?.precision) ?? (field?.formula ? 4 : undefined);
  if (precision === undefined) return String(value);
  const rounded = applyNumberFormat(value, precision, field?.numberFormat);
  return Object.is(rounded, -0) ? (0).toFixed(precision) : rounded.toFixed(precision);
}

function applyNumberFormat(value: number, precision: number, format?: string) {
  const scale = 10 ** precision;
  if (format === "ceil") return Math.ceil(value * scale) / scale;
  if (format === "floor") return Math.floor(value * scale) / scale;
  if (format === "truncate") return Math.trunc(value * scale) / scale;
  if (format === "round_half_even") return roundHalfEven(value, precision);
  return Math.round(value * scale) / scale;
}

function roundHalfEven(value: number, precision: number) {
  const scale = 10 ** precision;
  const scaled = value * scale;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const epsilon = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8;
  if (diff > 0.5 + epsilon) return (floor + 1) / scale;
  if (diff < 0.5 - epsilon) return floor / scale;
  return (floor % 2 === 0 ? floor : floor + 1) / scale;
}

function normalizedPrecision(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10 ? value : undefined;
}

export function useEditorRuntimeFormulaEngine(fieldModel: FieldModel, document: EditorDocument, saved: EditorRuntimeValues = {}) {
  const [manualValues, setManualValues] = useState(() => initialValues(fieldModel, document, saved));
  const values = useMemo(() => computeValues(fieldModel, document, manualValues), [document, fieldModel, manualValues]);
  const setValue = useCallback((key: string, value: string) => {
    setManualValues((current) => current[key] === value ? current : { ...current, [key]: value });
  }, []);
  return { values, setValue };
}

function walkInlines(document: EditorDocument, visit: (part: EditorSlotInline) => void) {
  const visitInline = (part: EditorInline) => {
    if (part.type !== "text") visit(part);
  };
  for (const block of document.blocks) {
    if (block.type === "paragraph") block.parts.forEach(visitInline);
    if (block.type === "table") {
      block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach(visitInline)));
    }
  }
}
