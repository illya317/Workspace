import type { EditorSlotInline, EditorSlotType, FieldDefinition } from "./types";

export type SlotPatch = Record<string, unknown>;
type InputMethod = "text" | "textarea" | "date" | "datetime" | "radio" | "checkbox" | "select";
type SlotValueType = "text" | "number" | "boolean" | "date" | "datetime" | "array";

export function inputMethodOptions() {
  return [
    { value: "text", label: "文本框" },
    { value: "textarea", label: "多行文本" },
    { value: "date", label: "日期" },
    { value: "datetime", label: "日期+时间" },
    { value: "radio", label: "单选" },
    { value: "checkbox", label: "多选" },
    { value: "select", label: "下拉" },
  ];
}

export function valueTypeOptions(attrs?: EditorSlotInline, field?: FieldDefinition) {
  const all = [
    { value: "text", label: "文本" },
    { value: "number", label: "数字" },
    { value: "boolean", label: "布尔值" },
    { value: "date", label: "日期" },
    { value: "datetime", label: "日期+时间" },
    { value: "array", label: "多值" },
  ];
  if (!attrs) return all;
  const method = inputMethod(attrs, field);
  if (method === "date") return all.filter((option) => option.value === "date");
  if (method === "datetime") return all.filter((option) => option.value === "datetime");
  if (method === "checkbox") return all.filter((option) => option.value === "array");
  if (method === "radio" || method === "select") return all.filter((option) => option.value === "text" || option.value === "boolean");
  return all.filter((option) => option.value === "text" || option.value === "number");
}

export function numberFormatOptions() {
  return [
    { value: "plain", label: "普通数字" },
    { value: "round_half_up", label: "四舍五入" },
    { value: "round_half_even", label: "四舍六入" },
    { value: "ceil", label: "向上取整" },
    { value: "floor", label: "向下取整" },
    { value: "truncate", label: "截断" },
  ];
}

export function inputMethod(attrs: EditorSlotInline, field?: FieldDefinition): InputMethod {
  const raw = attrs.inputType ?? field?.inputType;
  const rawValueType = attrs.valueType ?? field?.valueType ?? field?.type;
  if (attrs.withTime || raw === "datetime" || (!raw && rawValueType === "datetime")) return "datetime";
  if (raw === "date" || (!raw && (rawValueType === "date" || attrs.slotKind === "date" || attrs.type === "dateSlot"))) return "date";
  if (raw === "text" || raw === "number") return "text";
  if (raw === "textarea") return "textarea";
  if (raw === "radio" || raw === "checkbox" || raw === "select") return raw;
  if (raw === "boolean" || (!raw && rawValueType === "boolean")) return "radio";
  if (effectiveOptions(attrs, field).length) return "select";
  return "text";
}

export function inputMethodPatch(value: string, attrs: EditorSlotInline, field?: FieldDefinition): SlotPatch {
  const semantic = textLikeValueType(attrs, field);
  const options = effectiveOptions(attrs, field);
  if (value === "date") return { inputType: "date", withTime: null, valueType: "date", options: null, placeholder: attrs.placeholder, numberFormat: null };
  if (value === "datetime") return { inputType: "date", withTime: true, valueType: "datetime", options: null, placeholder: attrs.placeholder, numberFormat: null };
  if (value === "textarea") return { inputType: "textarea", withTime: null, valueType: semantic, options: null, placeholder: attrs.placeholder, numberFormat: semantic === "number" ? numberFormat(attrs) : null };
  if (value === "radio" || value === "select") {
    const nextOptions = options.length ? options : defaultOptions(value);
    return { inputType: value, withTime: null, valueType: inferChoiceValueType(nextOptions, value), options: nextOptions, placeholder: null, numberFormat: null };
  }
  if (value === "checkbox") return { inputType: "checkbox", withTime: null, valueType: "array", options: options.length ? options : defaultOptions("checkbox"), placeholder: null, numberFormat: null };
  return { inputType: "text", withTime: null, valueType: semantic, options: null, placeholder: attrs.placeholder, numberFormat: semantic === "number" ? numberFormat(attrs) : null };
}

export function numberFormat(attrs: EditorSlotInline) {
  const value = attrs.numberFormat;
  return numberFormatOptions().some((option) => option.value === value) ? value : "plain";
}

export function slotValueType(attrs: EditorSlotInline, field?: FieldDefinition): SlotValueType {
  const method = inputMethod(attrs, field);
  if (method === "datetime") return "datetime";
  if (method === "date") return "date";
  if (method === "checkbox") return "array";
  const raw = normalizeValueType(attrs.valueType ?? field?.valueType ?? field?.type);
  if (method === "text" || method === "textarea") {
    if (raw === "number" || attrs.inputType === "number" || field?.inputType === "number") return "number";
    return "text";
  }
  if (method === "radio" || method === "select") return raw === "boolean" ? "boolean" : inferChoiceValueType(effectiveOptions(attrs, field), method);
  return "text";
}

export function valueTypePatch(value: string, attrs: EditorSlotInline, field?: FieldDefinition): SlotPatch {
  const next = normalizeValueType(value) ?? "text";
  const options = effectiveOptions(attrs, field);
  if (next === "date") return { inputType: "date", withTime: null, valueType: "date", options: null, numberFormat: null };
  if (next === "datetime") return { inputType: "date", withTime: true, valueType: "datetime", options: null, numberFormat: null };
  if (next === "boolean") return { inputType: "radio", withTime: null, valueType: "boolean", options: booleanOptions(options), placeholder: null, numberFormat: null };
  if (next === "array") return { inputType: "checkbox", withTime: null, valueType: "array", options: options.length ? options : defaultOptions("checkbox"), placeholder: null, numberFormat: null };
  const method = inputMethod(attrs, field);
  const inputType = method === "date" || method === "datetime" || method === "checkbox" || attrs.inputType === "number" || attrs.inputType === "field" ? "text" : attrs.inputType;
  return { valueType: next, inputType, withTime: null, numberFormat: next === "number" ? numberFormat(attrs) : null };
}

export function effectiveOptions(attrs: EditorSlotInline, field?: FieldDefinition) {
  const options = attrs.options?.length ? attrs.options : field?.options;
  return options?.map(String).filter(Boolean) ?? [];
}

export function normalizeInputAttrs(
  attrs: EditorSlotInline,
  field: FieldDefinition | undefined,
  supportsInputMethod: (attrs: EditorSlotInline, type: EditorSlotType) => boolean,
): EditorSlotInline {
  if (!supportsInputMethod(attrs, attrs.type)) return attrs;
  const method = inputMethod(attrs, field);
  const valueType = slotValueType(attrs, field);
  return merge(attrs, {
    inputType: method === "datetime" ? "date" : method,
    withTime: method === "datetime" ? true : method === "date" ? null : attrs.withTime ? null : undefined,
    valueType,
    options: isOptionMethod(method) ? effectiveOptions(attrs, field).length ? effectiveOptions(attrs, field) : defaultOptions(method) : null,
    numberFormat: valueType === "number" ? numberFormat(attrs) : null,
  });
}

export function isOptionSlot(attrs: EditorSlotInline, field?: FieldDefinition) {
  return isOptionMethod(inputMethod(attrs, field));
}

export function supportsValueType(attrs: EditorSlotInline, field: FieldDefinition | undefined, type: EditorSlotType, supportsInputMethod: (attrs: EditorSlotInline, type: EditorSlotType) => boolean) {
  return supportsInputMethod(attrs, type);
}

export function supportsNumberFormat(attrs: EditorSlotInline, field: FieldDefinition | undefined, type: EditorSlotType, supportsInputMethod: (attrs: EditorSlotInline, type: EditorSlotType) => boolean) {
  return supportsValueType(attrs, field, type, supportsInputMethod) && slotValueType(attrs, field) === "number";
}

function textLikeValueType(attrs: EditorSlotInline, field?: FieldDefinition) {
  const type = slotValueType(attrs, field);
  return type === "number" ? type : "text";
}

function normalizeValueType(value: unknown): SlotValueType | undefined {
  if (value === "number" || value === "boolean" || value === "date" || value === "datetime" || value === "array") return value;
  if (value === "checkbox") return "array";
  if (value === "line" || value === "field" || value === "text" || value === "string") return "text";
  return undefined;
}

function inferChoiceValueType(options: string[], method: InputMethod): SlotValueType {
  if (method === "checkbox") return "array";
  return isBooleanOptionSet(options) ? "boolean" : "text";
}

function booleanOptions(options: string[]) {
  return isBooleanOptionSet(options) ? options : ["是", "否"];
}

function isBooleanOptionSet(options: string[]) {
  if (options.length !== 2) return false;
  const normalized = options.map((option) => option.replace(/\s/g, ""));
  const joined = normalized.join("|");
  if (["是|否", "否|是", "符合|不符合", "不符合|符合", "符合要求|不符合要求", "不符合要求|符合要求", "无|有", "有|无", "未检出|检出", "检出|未检出"].includes(joined)) return true;
  return normalized.some((option) => /^(不|未|无|否)/.test(option)) && normalized.some((option) => !/^(不|未|无|否)/.test(option));
}

function defaultOptions(inputType: "radio" | "checkbox" | "select") {
  return inputType === "radio" ? ["是", "否"] : ["选项1", "选项2"];
}

function isOptionMethod(method: InputMethod): method is "radio" | "checkbox" | "select" {
  return method === "radio" || method === "checkbox" || method === "select";
}

function merge(attrs: EditorSlotInline, patch: SlotPatch): EditorSlotInline {
  const next: Record<string, unknown> = { ...attrs };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  });
  return next as unknown as EditorSlotInline;
}
