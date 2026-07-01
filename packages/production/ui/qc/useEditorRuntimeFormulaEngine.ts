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

function toFormulaValue(value: string | undefined): FormulaValue | undefined {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function displayValue(value: FormulaValue | undefined) {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : "";
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
    return {
      fieldKey,
      label: slot?.label ?? field?.label ?? field?.name ?? fieldKey,
      aliases: aliases(fieldKey, field, formula, slot),
      formula: slot?.formulaText ?? formula?.formulaText ?? formula?.rule ?? field?.formula ?? null,
      value: toFormulaValue(values[fieldKey]),
      valueType: field?.valueType ?? field?.type,
      inputType: slot?.inputType ?? field?.inputType,
      attr: field?.attr,
      slotKind: slot?.slotKind ?? field?.slotKind,
    };
  });
}

function computeValues(fieldModel: FieldModel, document: EditorDocument, values: EditorRuntimeValues) {
  const fields = formulaFields(fieldModel, document, values);
  const targetFieldKeys = fields.filter((field) => field.formula).map((field) => field.fieldKey);
  if (!targetFieldKeys.length) return values;
  const engine = createFormulaEngine();
  const result = engine.evaluate({
    model: { fields },
    values: Object.fromEntries(Object.entries(values).map(([fieldKey, value]) => [fieldKey, toFormulaValue(value)])),
    targetFieldKeys,
  });
  const next = { ...values };
  for (const fieldKey of targetFieldKeys) {
    const rendered = displayValue(result.values[fieldKey]);
    if (rendered) next[fieldKey] = rendered;
  }
  return next;
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
