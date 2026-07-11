import type { EditorSlotInline, EditorSlotType, FieldDefinition } from "../../../document-editor/types";
import { normalizeInputAttrs } from "../../../document-editor/slot-input-semantics";
import {
  failCommand,
  okCommand,
  type DomainValidationIssue,
  type DomainValidationResult,
} from "../../domain-validation";

type JsonRecord = Record<string, unknown>;

const knownInputTypes = new Set(["text", "textarea", "date", "datetime", "radio", "checkbox", "select", "number", "field", "boolean"]);
const knownValueTypes = new Set(["text", "string", "number", "boolean", "date", "datetime", "array", "line", "field", "checkbox", "radio", "select"]);

export function normalizeDocumentSlotPayload(
  document: unknown,
  fieldModel: unknown,
): DomainValidationResult<{ document: unknown; fieldModel: unknown }> {
  const normalizedFieldModel = normalizeFieldModel(fieldModel);
  if (normalizedFieldModel.ok === false) return failFrom(normalizedFieldModel);
  const fields = fieldMap(normalizedFieldModel.data);
  const normalizedDocument = normalizeDocumentNode(document, fields);
  if (normalizedDocument.ok === false) return failFrom(normalizedDocument);
  return okCommand({ document: normalizedDocument.data, fieldModel: normalizedFieldModel.data });
}

function normalizeDocumentNode(value: unknown, fields: Map<string, FieldDefinition>): DomainValidationResult<unknown> {
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const normalized = normalizeDocumentNode(item, fields);
      if (normalized.ok === false) return failFrom(normalized);
      items.push(normalized.data);
    }
    return okCommand(items);
  }
  if (!isRecord(value)) return okCommand(value);

  const next: JsonRecord = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeDocumentNode(item, fields);
    if (normalized.ok === false) return failFrom(normalized);
    next[key] = normalized.data;
  }
  if (!isSlotNode(next)) return okCommand(next);
  const fieldKey = stringField(next.fieldKey);
  const normalized = normalizeSlot(next, fields.get(fieldKey));
  if (normalized.ok === false) return failFrom(normalized);
  return okCommand(normalized.data);
}

function normalizeFieldModel(value: unknown): DomainValidationResult<unknown> {
  if (value === undefined) return okCommand(undefined);
  if (!isRecord(value)) return failCommand("fieldModel 必须是 JSON 对象", 400, "fieldModel");
  const fields = value.fields;
  if (!Array.isArray(fields) && !isRecord(fields)) return okCommand(value);
  const next: JsonRecord = { ...value };
  if (Array.isArray(fields)) {
    const items: unknown[] = [];
    for (const field of fields) {
      const normalized = normalizeFieldDefinition(field);
      if (normalized.ok === false) return failFrom(normalized);
      items.push(normalized.data);
    }
    next.fields = items;
    return okCommand(next);
  }
  const normalizedFields: JsonRecord = {};
  for (const [key, field] of Object.entries(fields)) {
    const normalized = normalizeFieldDefinition(field, key);
    if (normalized.ok === false) return failFrom(normalized);
    normalizedFields[key] = normalized.data;
  }
  next.fields = normalizedFields;
  return okCommand(next);
}

function normalizeFieldDefinition(value: unknown, fallbackKey?: string): DomainValidationResult<unknown> {
  if (!isRecord(value) || !isInputField(value)) return okCommand(value);
  const fieldKey = stringField(value.fieldKey) || stringField(value.key) || fallbackKey || "field";
  const attrs: EditorSlotInline = {
    type: "fieldSlot",
    fieldKey,
    slotKind: stringField(value.slotKind) as EditorSlotInline["slotKind"],
    inputType: stringField(value.inputType) || undefined,
    valueType: stringField(value.valueType) || stringField(value.type) || undefined,
    numberFormat: stringField(value.numberFormat) || undefined,
    precision: numberField(value.precision),
    options: stringArray(value.options),
    defaultValue: stringField(value.defaultValue) || undefined,
  };
  const normalized = normalizeSlotAttrs(attrs, undefined, "fieldModel");
  if (normalized.ok === false) return failFrom(normalized);
  return okCommand(merge(value, fieldPatch(normalized.data)));
}

function normalizeSlot(value: JsonRecord, field?: FieldDefinition): DomainValidationResult<JsonRecord> {
  const precisionIssue = validatePrecision(value.precision, "document.precision");
  if (precisionIssue) return precisionIssue;
  if (!supportsDomainInputMethod(value)) return okCommand(value);
  const normalized = normalizeSlotAttrs(value as unknown as EditorSlotInline, field, "document");
  if (normalized.ok === false) return failFrom(normalized);
  return okCommand(merge(value, slotPatch(normalized.data)));
}

function normalizeSlotAttrs(attrs: EditorSlotInline, field: FieldDefinition | undefined, fieldName: string) {
  const inputType = stringField(attrs.inputType);
  if (inputType && !knownInputTypes.has(inputType)) return failCommand("输入方式无效", 400, `${fieldName}.inputType`);
  const valueType = stringField(attrs.valueType);
  if (valueType && !knownValueTypes.has(valueType)) return failCommand("数据类型无效", 400, `${fieldName}.valueType`);
  const normalized = normalizeInputAttrs(attrs, field, (candidate, type) => supportsDomainInputMethod({ ...candidate, type }));
  const defaultValueIssue = validateDefaultValue(normalized.defaultValue ?? attrs.defaultValue, normalized.valueType, `${fieldName}.defaultValue`);
  if (defaultValueIssue) return defaultValueIssue;
  const precisionIssue = validatePrecision(normalized.precision ?? attrs.precision, `${fieldName}.precision`);
  if (precisionIssue) return precisionIssue;
  return okCommand(normalized);
}

function slotPatch(attrs: EditorSlotInline) {
  return {
    inputType: attrs.inputType,
    valueType: attrs.valueType,
    withTime: attrs.withTime,
    options: attrs.options,
    numberFormat: attrs.numberFormat,
    precision: attrs.precision,
  };
}

function fieldPatch(attrs: EditorSlotInline) {
  return {
    inputType: attrs.inputType,
    valueType: attrs.valueType,
    type: attrs.valueType,
    options: attrs.options,
    numberFormat: attrs.numberFormat,
    precision: attrs.precision,
  };
}

function supportsDomainInputMethod(value: JsonRecord) {
  const type = value.type as EditorSlotType | undefined;
  if (type !== "fieldSlot" && type !== "dateSlot") return false;
  if (value.slotKind === "formula" || value.slotKind === "reference") return false;
  if (stringField(value.formula) || stringField(value.formulaText) || stringField(value.referenceFieldKey)) return false;
  return true;
}

function isInputField(value: JsonRecord) {
  if (value.attr === "calculated" || value.mode === "formula" || value.slotKind === "formula" || value.slotKind === "reference") return false;
  if (stringField(value.formula) || stringField(value.referenceFieldKey)) return false;
  const inputType = stringField(value.inputType);
  const valueType = stringField(value.valueType) || stringField(value.type);
  return Boolean(inputType || valueType || stringArray(value.options)?.length);
}

function isSlotNode(value: JsonRecord) {
  return value.type === "fieldSlot" || value.type === "dateSlot" || value.type === "formulaSlot" || value.type === "signatureSlot";
}

function fieldMap(value: unknown) {
  const fields = new Map<string, FieldDefinition>();
  if (!isRecord(value)) return fields;
  const rawFields = value.fields;
  if (Array.isArray(rawFields)) {
    rawFields.forEach((field) => {
      if (!isRecord(field)) return;
      const key = stringField(field.fieldKey) || stringField(field.key);
      if (key) fields.set(key, field as FieldDefinition);
    });
  } else if (isRecord(rawFields)) {
    Object.entries(rawFields).forEach(([key, field]) => {
      if (isRecord(field)) fields.set(key, field as FieldDefinition);
    });
  }
  return fields;
}

function merge(value: JsonRecord, patch: JsonRecord) {
  const next: JsonRecord = { ...value };
  Object.entries(patch).forEach(([key, item]) => {
    if (item === undefined || item === null || (Array.isArray(item) && item.length === 0)) delete next[key];
    else next[key] = item;
  });
  return next;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : undefined;
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validateDefaultValue(value: unknown, valueType: unknown, fieldName: string) {
  const text = stringField(value);
  if (!text) return null;
  if (valueType === "number" && !Number.isFinite(Number(text))) return failCommand("默认值不符合数据类型：应填写数字", 400, fieldName);
  if (valueType === "boolean" && !booleanDefaultValue(text)) return failCommand("默认值不符合数据类型：应填写布尔值", 400, fieldName);
  if (valueType === "date" && !dateDefaultValue(text)) return failCommand("默认值不符合数据类型：应填写日期", 400, fieldName);
  if (valueType === "datetime" && !dateTimeDefaultValue(text)) return failCommand("默认值不符合数据类型：应填写日期+时间", 400, fieldName);
  return null;
}

function validatePrecision(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10) return failCommand("小数位数必须是 0 到 10 的整数", 400, fieldName);
  return null;
}

function booleanDefaultValue(value: string) {
  return ["true", "false", "是", "否", "符合", "不符合", "符合要求", "不符合要求", "有", "无", "检出", "未检出"].includes(value);
}

function dateDefaultValue(value: string) {
  return /^(\d{4}|\d{2})[-/](\d{1,2})[-/](\d{1,2})$/.test(value);
}

function dateTimeDefaultValue(value: string) {
  return /^(\d{4}|\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?)$/.test(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failFrom<T>(result: { ok: false; issue: DomainValidationIssue }): DomainValidationResult<T> {
  return { ok: false, issue: result.issue };
}
