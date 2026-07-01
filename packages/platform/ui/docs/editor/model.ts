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
import { normalizePrecheckHeadings } from "./precheck-normalize";

export const EDITOR_PERMISSION_ROLES: EditorPermissionRole[] = ["viewer", "editor", "delete", "manager"];

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
  if (status === "archived") return "已归档";
  return "草稿";
}

export function roleLabel(role: EditorPermissionRole) {
  if (role === "manager") return "管理";
  if (role === "delete") return "删除";
  if (role === "editor") return "编辑";
  return "查看";
}

export function normalizePermissionRole(value: unknown): EditorPermissionRole {
  return EDITOR_PERMISSION_ROLES.includes(value as EditorPermissionRole) ? value as EditorPermissionRole : "viewer";
}

export function statusTone(status: EditorTemplateListItemDto["status"]) {
  if (status === "published") return "success" as const;
  if (status === "archived") return "muted" as const;
  return "default" as const;
}

export function canEdit(role: EditorPermissionRole | undefined) {
  return role === "editor" || role === "delete" || role === "manager";
}

export function canManage(role: EditorPermissionRole | undefined) {
  return role === "manager";
}

export function canDelete(role: EditorPermissionRole | undefined) {
  return role === "delete" || role === "manager";
}

export function isEditableSpace(space: EditorSpaceDto) {
  return canEdit(space.role);
}

export function normalizeEditorDocument(detail: EditorTemplateDetailDto | null): EditorDocument {
  if (isEditorDocument(detail?.document)) {
    return normalizePrecheckHeadings({ ...detail.document, title: detail.title || detail.document.title });
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
      formulaTemplates: Array.isArray(model.formulaTemplates) ? model.formulaTemplates : [],
    };
  }
  return { schemaVersion: 1, fields: {}, formulas: {}, formulaTemplates: [] };
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
      slotKind: field.slotKind,
      valueType: field.valueType,
      inputType: field.inputType,
      attr: field.attr,
    });
  });

  Object.entries(formulaByKey).forEach(([key, formula]) => {
    const existing = byKey.get(key);
    byKey.set(key, {
      fieldKey: key,
      label: existing?.label ?? key,
      aliases: Array.from(new Set([...(existing?.aliases ?? fieldAliases(key)), formula.alias].filter((value): value is string => Boolean(value)))),
      formula: existing?.formula ?? formula.formulaText ?? formula.rule ?? null,
      value: existing?.value,
      slotKind: existing?.slotKind ?? formula.slotKind,
      valueType: existing?.valueType,
      inputType: existing?.inputType,
      attr: existing?.attr,
    });
  });

  return Array.from(byKey.values());
}

function fieldAliases(key: string, field?: FieldDefinition) {
  return Array.from(new Set([
    key.split("/").at(-1) ?? key,
    field?.name,
    field?.label,
    field?.alias,
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

function formatFormulaError(error: FormulaEvaluationError) {
  if (error.type === "missing_field") return `缺少字段或值：${error.reference ?? "未知"}`;
  if (error.type === "invalid_function") return `不支持函数：${error.functionName ?? "未知"}`;
  if (error.type === "circular_dependency") return "循环依赖";
  return error.message || "公式错误";
}
