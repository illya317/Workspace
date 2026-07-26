import { createFormulaEngine, type FormulaField, type FormulaValue } from "@workspace/platform/formula";
import type {
  EditorBlock,
  EditorDocument,
  EditorInline,
  EditorSlotInline,
  FieldDefinition,
  FieldModel,
  FormulaDefinition,
} from "@workspace/platform/document-editor";

export type QcRuntimeValues = Record<string, string>;

export interface QcRuntimeValidationResult {
  values: QcRuntimeValues;
  formulaValues: QcRuntimeValues;
  errors: string[];
}

function fieldEntries(fieldModel: FieldModel): Array<[string, FieldDefinition]> {
  if (Array.isArray(fieldModel.fields)) {
    return fieldModel.fields.map((field, index) => [field.fieldKey ?? field.key ?? `field_${index + 1}`, field]);
  }
  return Object.entries(fieldModel.fields);
}

function formulaEntries(fieldModel: FieldModel): Array<[string, FormulaDefinition]> {
  return Object.entries(fieldModel.formulas ?? {});
}

export function editorSlotEntries(document: EditorDocument | EditorBlock[]): EditorSlotInline[] {
  const entries: EditorSlotInline[] = [];
  walkInlines(Array.isArray(document) ? document : document.blocks, (part) => entries.push(part));
  return entries;
}

export function writableQcRuntimeKeys(blocks: EditorBlock[]) {
  return new Set(editorSlotEntries(blocks).filter(isWritableRuntimeSlot).flatMap((slot) => [
    slot.fieldKey,
    ...(slot.withTime ? [`${slot.fieldKey}_hour`] : []),
  ]));
}

export function writableQcRuntimeValues(values: QcRuntimeValues, blocks: EditorBlock[]) {
  const keys = writableQcRuntimeKeys(blocks);
  return Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key)));
}

export function hasWritableQcRuntimeChanges(values: QcRuntimeValues, initialValues: QcRuntimeValues, blocks: EditorBlock[]) {
  for (const key of writableQcRuntimeKeys(blocks)) {
    if (String(values[key] ?? "") !== String(initialValues[key] ?? "")) return true;
  }
  return false;
}

export function initialQcRuntimeValues(fieldModel: FieldModel, document: EditorDocument, saved: QcRuntimeValues) {
  const next = { ...saved };
  const fields = new Map(fieldEntries(fieldModel));
  for (const slot of editorSlotEntries(document)) {
    const field = fields.get(slot.fieldKey);
    const defaultValue = slot.defaultValue ?? field?.defaultValue;
    if (next[slot.fieldKey] == null && defaultValue != null) next[slot.fieldKey] = defaultValue;
  }
  return next;
}

export function computeQcRuntimeValues(
  fieldModel: FieldModel,
  document: EditorDocument,
  values: QcRuntimeValues,
  targetFieldKeys?: string[],
) {
  const fields = formulaFields(fieldModel, document, values);
  const targets = targetFieldKeys ?? fields.filter((field) => field.formula).map((field) => field.fieldKey);
  if (!targets.length) return { values: { ...values }, errors: [] };
  const result = createFormulaEngine().evaluate({
    model: { fields },
    values: Object.fromEntries(fields.map((field) => [
      field.fieldKey,
      field.value ?? toFormulaValue(values[field.fieldKey], field.valueType, values[`${field.fieldKey}_hour`]),
    ])),
    targetFieldKeys: targets,
  });
  const next = { ...values };
  const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
  for (const fieldKey of targets) {
    const rendered = displayValue(result.values[fieldKey], fieldByKey.get(fieldKey));
    if (rendered !== "") next[fieldKey] = rendered;
  }
  return { values: next, errors: result.errors };
}

export function validateQcRuntimeMutation(input: {
  fieldModel: FieldModel;
  document: EditorDocument;
  blocks: EditorBlock[];
  currentValues: QcRuntimeValues;
  submittedValues: QcRuntimeValues;
  requireAllWritable?: boolean;
}): QcRuntimeValidationResult {
  const merged = initialQcRuntimeValues(input.fieldModel, input.document, {
    ...input.currentValues,
    ...input.submittedValues,
  });
  const fields = new Map(fieldEntries(input.fieldModel));
  const slots = groupSlotsByFieldKey(editorSlotEntries(input.document));
  const errors: string[] = [];

  for (const key of writableQcRuntimeKeys(input.blocks)) {
    const value = String(merged[key] ?? "").trim();
    const slot = primarySlot(slots.get(key) ?? []);
    const field = fields.get(key);
    if (input.requireAllWritable && !key.endsWith("_hour") && !value) {
      errors.push(`${runtimeFieldLabel(key, slot, field)}不能为空`);
      continue;
    }
    if (!value || !(key in input.submittedValues)) continue;
    const options = slot?.options ?? field?.options;
    const valueType = (slot?.valueType ?? field?.valueType ?? inferredValueType(slot, field))?.toLowerCase();
    const selectedValues = valueType === "array" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [value];
    if (options?.length && selectedValues.some((item) => !options.includes(item))) errors.push(`${runtimeFieldLabel(key, slot, field)}不是允许的选项`);
    if (valueType === "number" && !Number.isFinite(Number(value))) errors.push(`${runtimeFieldLabel(key, slot, field)}必须是数字`);
    if ((valueType === "date" || valueType === "datetime") && !validIsoDate(value)) errors.push(`${runtimeFieldLabel(key, slot, field)}必须是有效日期`);
  }

  const formulaTargets = formulaFieldKeys(input.fieldModel, input.blocks);
  const computed = computeQcRuntimeValues(input.fieldModel, input.document, merged, formulaTargets);
  errors.push(...computed.errors.map((error) => error.message));
  return {
    values: computed.values,
    formulaValues: Object.fromEntries(formulaTargets.flatMap((key) => computed.values[key] == null ? [] : [[key, computed.values[key]]])),
    errors: [...new Set(errors)],
  };
}

export function qcRuntimeFieldMetadata(fieldModel: FieldModel, fieldKey: string) {
  const field = new Map(fieldEntries(fieldModel)).get(fieldKey);
  return {
    valueType: field?.valueType ?? field?.type,
    unit: field?.unit,
  };
}

function formulaFieldKeys(fieldModel: FieldModel, blocks: EditorBlock[]) {
  const formulas = new Map(formulaEntries(fieldModel));
  return [...new Set(editorSlotEntries(blocks)
    .filter((slot) => slot.slotKind === "formula" || Boolean(slot.formulaText) || formulas.has(slot.fieldKey))
    .map((slot) => slot.fieldKey))];
}

function isWritableRuntimeSlot(part: EditorSlotInline) {
  return !part.referenceFieldKey
    && !part.fieldKey.includes("/signature/")
    && part.slotKind !== "formula"
    && part.slotKind !== "reference"
    && !part.readonlyDisplay;
}

function formulaFields(fieldModel: FieldModel, document: EditorDocument, values: QcRuntimeValues): FormulaField[] {
  const fields = new Map(fieldEntries(fieldModel));
  const formulas = new Map(formulaEntries(fieldModel));
  const slots = groupSlotsByFieldKey(editorSlotEntries(document));
  const keys = new Set([...fields.keys(), ...formulas.keys(), ...slots.keys()]);
  return [...keys].map((fieldKey) => {
    const field = fields.get(fieldKey);
    const formula = formulas.get(fieldKey);
    const fieldSlots = slots.get(fieldKey) ?? [];
    const slot = primarySlot(fieldSlots);
    const valueType = slot?.valueType ?? formula?.valueType ?? field?.valueType ?? inferredValueType(slot, field);
    const valueKey = slot?.referenceFieldKey ?? fieldKey;
    return {
      fieldKey,
      label: slot?.label ?? field?.label ?? field?.name ?? fieldKey,
      aliases: aliases(fieldKey, field, formula, fieldSlots),
      context: slot ? slotContextLabel(slot) : fieldSourceContextLabel(field),
      formula: slot?.formulaText ?? formula?.formulaText ?? formula?.rule ?? field?.formula ?? null,
      value: toFormulaValue(values[valueKey], valueType, values[`${valueKey}_hour`]),
      valueType,
      inputType: normalizedInputType(slot?.inputType ?? field?.inputType, slot?.options ?? field?.options),
      numberFormat: slot?.numberFormat ?? formula?.numberFormat ?? field?.numberFormat,
      formulaInputMode: slot?.formulaInputMode ?? field?.formulaInputMode,
      precision: slot?.precision ?? formula?.precision ?? field?.precision,
      attr: field?.attr,
      slotKind: slot?.slotKind ?? formula?.slotKind ?? field?.slotKind,
    };
  });
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

function aliases(fieldKey: string, field?: FieldDefinition, formula?: FormulaDefinition, slots: EditorSlotInline[] = []) {
  return Array.from(new Set([
    ...slots.flatMap((slot) => [slot.alias, slot.label]),
    field?.alias,
    formula?.alias,
    fieldKey,
    field?.fieldKey,
    field?.key,
    field?.name,
    field?.label,
    fieldKey.split("/").at(-1),
  ].filter((value): value is string => Boolean(value))));
}

function groupSlotsByFieldKey(slots: EditorSlotInline[]) {
  const grouped = new Map<string, EditorSlotInline[]>();
  slots.forEach((slot) => grouped.set(slot.fieldKey, [...(grouped.get(slot.fieldKey) ?? []), slot]));
  return grouped;
}

function primarySlot(slots: EditorSlotInline[]) {
  return slots.find((slot) => slot.formulaText || slot.slotKind === "formula")
    ?? slots.find((slot) => slot.referenceFieldKey || slot.slotKind === "reference")
    ?? slots[0];
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

function fieldSourceContextLabel(field?: FieldDefinition) {
  const source = ((field as FieldDefinition & { source?: Record<string, unknown> } | undefined)?.source ?? field?.metadata?.source ?? {}) as Record<string, unknown>;
  const [product, stage, sequence, test] = [source.productName, source.stageLabel, source.sequence, source.testName].map(stringValue);
  return [product, stage, [sequence, test].filter(Boolean).join(" ")].filter(Boolean).join(" / ");
}

function slotContextLabel(part: EditorSlotInline) {
  const source = part.metadata?.source && typeof part.metadata.source === "object" && !Array.isArray(part.metadata.source)
    ? part.metadata.source as Record<string, unknown>
    : part.metadata ?? {};
  const [product, stage, sequence, test] = [source.productName, source.stageLabel, source.sequence, source.testName].map(stringValue);
  return [product, stage, [sequence, test].filter(Boolean).join(" ")].filter(Boolean).join(" / ");
}

function runtimeFieldLabel(key: string, slot?: EditorSlotInline, field?: FieldDefinition) {
  return slot?.label?.trim() || field?.label?.trim() || field?.name?.trim() || key;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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

function walkInlines(blocks: EditorBlock[], visit: (part: EditorSlotInline) => void) {
  const visitInline = (part: EditorInline) => { if (part.type !== "text") visit(part); };
  for (const block of blocks) {
    if (block.type === "paragraph") block.parts.forEach(visitInline);
    if (block.type === "table") block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach(visitInline)));
  }
}
