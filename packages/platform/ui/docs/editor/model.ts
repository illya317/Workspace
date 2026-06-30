import {
  createEmptyEditorDocument,
  type EditorDocument,
  type FieldDefinition,
  type FieldModel,
} from "@workspace/platform/document-editor";
import {
  createFormulaEngine,
  type FormulaEvaluationError,
  type FormulaField,
  type FormulaValue,
} from "@workspace/platform/formula";
import type {
  EditorPermissionRole,
  EditorSpaceDto,
  EditorTemplateDetailDto,
  EditorTemplateListItemDto,
} from "./api";

export const GENERATED_QC_SPACE_ID = "qc-official";
export const EDITOR_PERMISSION_ROLES: EditorPermissionRole[] = ["viewer", "editor", "manager"];

export type FieldFormulaRow = {
  key: string;
  label: string;
  type: string;
  unit: string;
  mode: string;
  formula: string;
  computedValue: string;
  error: string;
};

export type FormulaComputation = {
  adapter: string;
  ok: boolean;
  values: Record<string, FormulaValue>;
  previewValues: Record<string, unknown>;
  errorsByFieldKey: Record<string, string>;
  errorCount: number;
};

export function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function statusLabel(status: EditorTemplateListItemDto["status"]) {
  if (status === "published") return "已发布";
  if (status === "reviewing") return "待发布";
  if (status === "archived") return "已归档";
  return "草稿";
}

export function roleLabel(role: EditorPermissionRole) {
  if (role === "manager") return "管理";
  if (role === "editor") return "编辑";
  return "查看";
}

export function normalizePermissionRole(value: unknown): EditorPermissionRole {
  return EDITOR_PERMISSION_ROLES.includes(value as EditorPermissionRole) ? value as EditorPermissionRole : "viewer";
}

export function statusTone(status: EditorTemplateListItemDto["status"]) {
  if (status === "published") return "green" as const;
  if (status === "reviewing") return "amber" as const;
  if (status === "archived") return "slate" as const;
  return "sky" as const;
}

export function isGeneratedTemplate(templateId: string | null) {
  return Boolean(templateId?.startsWith("generated-qc:"));
}

export function canEdit(role: EditorPermissionRole | undefined) {
  return role === "editor" || role === "manager";
}

export function canManage(role: EditorPermissionRole | undefined) {
  return role === "manager";
}

export function isEditableSpace(space: EditorSpaceDto) {
  return space.id !== GENERATED_QC_SPACE_ID && canEdit(space.role);
}

export function normalizeEditorDocument(detail: EditorTemplateDetailDto | null): EditorDocument {
  if (isEditorDocument(detail?.document)) {
    return { ...detail.document, title: detail.title || detail.document.title };
  }
  return createEmptyEditorDocument(detail?.title ?? "未命名模板");
}

export function normalizeFieldModel(value: unknown): FieldModel {
  if (value && typeof value === "object" && "fields" in value) {
    const model = value as FieldModel;
    return {
      ...model,
      fields: model.fields ?? {},
      formulas: model.formulas ?? {},
    };
  }
  return { schemaVersion: 1, fields: {}, formulas: {} };
}

function isEditorDocument(value: unknown): value is EditorDocument {
  return Boolean(
    value
      && typeof value === "object"
      && "blocks" in value
      && Array.isArray((value as { blocks?: unknown }).blocks),
  );
}

function fieldKey(field: FieldDefinition, fallback: string) {
  return field.fieldKey ?? field.key ?? field.name ?? fallback;
}

function fieldLabel(field: FieldDefinition, key: string) {
  return field.label ?? field.name ?? field.fieldKey ?? field.key ?? key;
}

export function fieldRows(fieldModel: FieldModel, computation: FormulaComputation): FieldFormulaRow[] {
  const rows: FieldFormulaRow[] = [];
  const seen = new Set<string>();
  const fields = Array.isArray(fieldModel.fields)
    ? fieldModel.fields.map((field, index) => [fieldKey(field, `field_${index + 1}`), field] as const)
    : Object.entries(fieldModel.fields);

  fields.forEach(([key, field]) => {
    const formula = field.formula
      ?? fieldModel.formulas?.[key]?.formulaText
      ?? fieldModel.formulas?.[key]?.rule
      ?? "";
    rows.push({
      key,
      label: fieldLabel(field, key),
      type: field.type ?? field.valueType ?? field.inputType ?? "-",
      unit: field.unit ?? "",
      mode: field.mode ?? (formula ? "formula" : field.readonlyDisplay ? "readonly" : "manual"),
      formula,
      computedValue: formatComputedValue(computation.values[key]),
      error: computation.errorsByFieldKey[key] ?? "",
    });
    seen.add(key);
  });

  Object.entries(fieldModel.formulas ?? {}).forEach(([key, formula]) => {
    if (seen.has(key)) return;
    rows.push({
      key,
      label: key,
      type: "number",
      unit: "",
      mode: formula.readonlyDisplay ? "readonly" : "formula",
      formula: formula.formulaText ?? formula.rule ?? "",
      computedValue: formatComputedValue(computation.values[key]),
      error: computation.errorsByFieldKey[key] ?? "",
    });
  });

  return rows;
}

export function evaluateFieldModel(fieldModel: FieldModel): FormulaComputation {
  const fields = formulaFields(fieldModel);
  const targetFieldKeys = fields.filter((field) => field.formula).map((field) => field.fieldKey);
  if (!targetFieldKeys.length) {
    const values = Object.fromEntries(fields
      .filter((field) => field.value !== undefined)
      .map((field) => [field.fieldKey, field.value ?? null]));
    return {
      adapter: "simple",
      ok: true,
      values,
      previewValues: values,
      errorsByFieldKey: {},
      errorCount: 0,
    };
  }

  const result = createFormulaEngine().evaluate({
    model: { fields },
    targetFieldKeys,
  });
  const errorsByFieldKey = Object.fromEntries(result.errors
    .filter((error) => error.fieldKey)
    .map((error) => [String(error.fieldKey), formatFormulaError(error)]));
  return {
    adapter: result.adapter,
    ok: result.ok,
    values: result.values,
    previewValues: {
      ...result.values,
      ...Object.fromEntries(Object.keys(errorsByFieldKey).map((fieldKey) => [fieldKey, "#ERROR"])),
    },
    errorsByFieldKey,
    errorCount: result.errors.length,
  };
}

function formulaFields(fieldModel: FieldModel): FormulaField[] {
  const fields = Array.isArray(fieldModel.fields)
    ? fieldModel.fields.map((field, index) => [fieldKey(field, `field_${index + 1}`), field] as const)
    : Object.entries(fieldModel.fields);
  const formulaByKey = fieldModel.formulas ?? {};
  const byKey = new Map<string, FormulaField>();

  fields.forEach(([key, field]) => {
    const formula = field.formula ?? formulaByKey[key]?.formulaText ?? formulaByKey[key]?.rule ?? undefined;
    byKey.set(key, {
      fieldKey: key,
      label: fieldLabel(field, key),
      aliases: fieldAliases(key, field),
      formula: formula || null,
      value: formulaValueFromField(field),
    });
  });

  Object.entries(formulaByKey).forEach(([key, formula]) => {
    const existing = byKey.get(key);
    byKey.set(key, {
      fieldKey: key,
      label: existing?.label ?? key,
      aliases: existing?.aliases ?? fieldAliases(key),
      formula: existing?.formula ?? formula.formulaText ?? formula.rule ?? null,
      value: existing?.value,
    });
  });

  return Array.from(byKey.values());
}

function fieldAliases(key: string, field?: FieldDefinition) {
  return Array.from(new Set([
    key.split("/").at(-1) ?? key,
    field?.name,
    field?.label,
    field?.fieldKey,
    field?.key,
  ].filter((value): value is string => Boolean(value))));
}

function formulaValueFromField(field: FieldDefinition): FormulaValue | undefined {
  const raw: unknown = field.defaultValue ?? field.recommendedValue;
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (field.type === "boolean" || field.valueType === "boolean") return raw === true || raw === "true" || raw === "是";
  if (field.type === "number" || field.valueType === "number" || field.inputType === "number") {
    const number = Number(raw);
    return Number.isFinite(number) ? number : undefined;
  }
  const number = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  if (Number.isFinite(number)) return number;
  return String(raw);
}

function formatComputedValue(value: FormulaValue | undefined) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  return String(value);
}

function formatFormulaError(error: FormulaEvaluationError) {
  if (error.type === "missing_field") return `缺少字段或值：${error.reference ?? "未知"}`;
  if (error.type === "invalid_function") return `不支持函数：${error.functionName ?? "未知"}`;
  if (error.type === "circular_dependency") return "循环依赖";
  return error.message || "公式错误";
}

function cloneFieldModel(model: FieldModel): FieldModel {
  return JSON.parse(JSON.stringify(model)) as FieldModel;
}

export function upsertFormula(model: FieldModel, key: string, formula: string): FieldModel {
  const next = cloneFieldModel(model);
  if (Array.isArray(next.fields)) {
    const field = next.fields.find((item, index) => fieldKey(item, `field_${index + 1}`) === key);
    if (field) {
      field.formula = formula;
      field.mode = "formula";
    } else {
      next.fields.push({ key, label: key, type: "number", mode: "formula", formula });
    }
  } else {
    const current = next.fields[key] ?? { key, label: key, type: "number" };
    next.fields[key] = { ...current, formula, mode: "formula" };
  }
  next.formulas = {
    ...(next.formulas ?? {}),
    [key]: {
      ...(next.formulas?.[key] ?? { fieldKey: key }),
      fieldKey: key,
      formulaText: formula,
    },
  };
  return next;
}

export function addFormulaField(model: FieldModel): FieldModel {
  const key = `formula_${Date.now()}`;
  return upsertFormula(model, key, "");
}
