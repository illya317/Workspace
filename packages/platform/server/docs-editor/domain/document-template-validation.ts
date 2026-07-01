import {
  failCommand,
  okCommand,
  type DomainValidationIssue,
  type DomainValidationResult,
} from "../../domain-validation";
import { normalizeDocumentFormulaRules } from "./document-template-formula-validation";
import { normalizeDocumentSlotPayload } from "./document-template-slot-normalization";
import {
  DOCS_EDITOR_SPACE_KINDS,
  DOCS_EDITOR_TEMPLATE_STATUSES,
  type DocsEditorSpaceKind,
  type DocsEditorTemplateStatus,
} from "../types";

const deprecatedFormulaKindKey = ["formula", "Kind"].join("");

export interface ListTemplatesInput {
  userId: number;
  spaceId?: number | string | null;
  status?: string | null;
  keyword?: string | null;
}

export interface TemplateIdInput {
  userId: number;
  templateId: number | string;
}

export interface SaveDraftInput {
  userId: number;
  templateId?: number | string | null;
  spaceId?: number | null;
  departmentId?: number | null;
  spaceKind?: string | null;
  title?: string | null;
  type?: string | null;
  document?: unknown;
  fieldModel?: unknown;
  sourceKind?: string | null;
  sourceProductKey?: string | null;
  sourceStageKeys?: string[] | null;
}

export interface CopyTemplateInput extends TemplateIdInput {
  targetSpaceId?: number | null;
  targetDepartmentId?: number | null;
  title?: string | null;
}

export type ListTemplatesCommand = {
  userId: number;
  spaceId?: number;
  status?: DocsEditorTemplateStatus;
  keyword?: string;
};

export type TemplateIdCommand = {
  userId: number;
  templateId: number;
};

export type SaveDraftCommand = {
  userId: number;
  templateId?: number;
  spaceId?: number;
  departmentId?: number;
  spaceKind?: DocsEditorSpaceKind;
  data: {
    title?: string;
    type?: string;
    documentJson?: string;
    fieldModelJson?: string;
    sourceKind?: string | null;
    sourceProductKey?: string | null;
    sourceStageKeys?: string | null;
  };
};

export type CopyTemplateCommand = {
  userId: number;
  templateId: number;
  targetSpaceId?: number;
  targetDepartmentId?: number;
  title?: string;
};

function failFrom<T>(result: { ok: false; issue: DomainValidationIssue }): DomainValidationResult<T> {
  return { ok: false, issue: result.issue };
}

function positiveId(value: number | string | null | undefined, field: string): DomainValidationResult<number | undefined> {
  if (value === null || value === undefined) return okCommand(undefined);
  const normalized = typeof value === "string" ? value.trim() : value;
  if (normalized === "") return okCommand(undefined);
  const parsed = typeof normalized === "string" ? Number(normalized) : normalized;
  if (!Number.isInteger(parsed) || parsed <= 0) return failCommand("无效ID", 400, field);
  return okCommand(parsed);
}

function optionalText(value: string | null | undefined, maxLength: number, field: string) {
  if (value === null || value === undefined) return okCommand(undefined);
  const text = value.trim();
  if (!text) return okCommand(undefined);
  if (text.length > maxLength) return failCommand(`${field} 过长`, 400, field);
  return okCommand(text);
}

function nullableText(value: string | null | undefined, maxLength: number, field: string) {
  if (value === undefined) return okCommand(undefined);
  if (value === null) return okCommand(null);
  const text = value.trim();
  if (!text) return okCommand(null);
  if (text.length > maxLength) return failCommand(`${field} 过长`, 400, field);
  return okCommand(text);
}

function jsonString(value: unknown, field: string): DomainValidationResult<string | undefined> {
  if (value === undefined) return okCommand(undefined);
  try {
    return okCommand(JSON.stringify(value));
  } catch {
    return failCommand(`${field} 必须是可序列化 JSON`, 400, field);
  }
}

function optionalSpaceKind(value: string | null | undefined) {
  if (!value) return okCommand(undefined);
  if (DOCS_EDITOR_SPACE_KINDS.includes(value as DocsEditorSpaceKind)) {
    return okCommand(value as DocsEditorSpaceKind);
  }
  return failCommand("空间类型无效", 400, "spaceKind");
}

function optionalStatus(value: string | null | undefined) {
  if (!value) return okCommand(undefined);
  if (DOCS_EDITOR_TEMPLATE_STATUSES.includes(value as DocsEditorTemplateStatus)) {
    return okCommand(value as DocsEditorTemplateStatus);
  }
  return failCommand("模板状态无效", 400, "status");
}

function sourceStageKeys(value: string[] | null | undefined) {
  if (value === undefined) return okCommand(undefined);
  if (value === null) return okCommand(null);
  const normalized = Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
  if (normalized.length > 100) return failCommand("阶段数量过多", 400, "sourceStageKeys");
  return okCommand(JSON.stringify(normalized));
}

const referenceAliasPattern = /^[xyp]\d+$/i;

type ReferenceCandidate = {
  alias: string;
  fieldKey: string;
  context: string;
};

export function normalizeDocumentTemplatePayload(document: unknown, fieldModel: unknown): DomainValidationResult<{ document: unknown; fieldModel: unknown }> {
  const slots = normalizeDocumentSlotPayload(document, fieldModel);
  if (slots.ok === false) return failFrom(slots);
  const formulas = normalizeDocumentFormulaRules(slots.data.document, slots.data.fieldModel);
  if (formulas.ok === false) return failFrom(formulas);
  const normalizedDocument = normalizeDocumentReferences(formulas.data.document, formulas.data.fieldModel);
  if (normalizedDocument.ok === false) return failFrom(normalizedDocument);
  return okCommand({ document: normalizedDocument.data, fieldModel: formulas.data.fieldModel });
}

function normalizeDocumentReferences(value: unknown, fieldModel?: unknown): DomainValidationResult<unknown> {
  if (value === undefined) return okCommand(undefined);
  const candidates = collectReferenceCandidates(value);
  const byFieldKey = new Set([...candidates.map((candidate) => candidate.fieldKey), ...collectFieldModelKeys(fieldModel)]);
  const byAlias = new Map<string, string>();
  const byContextFieldKey = new Map<string, Set<string>>();
  const byContextAlias = new Map<string, Map<string, string>>();
  candidates.forEach((candidate) => {
    if (!byAlias.has(candidate.alias)) byAlias.set(candidate.alias, candidate.fieldKey);
    const fieldKeys = byContextFieldKey.get(candidate.context) ?? new Set<string>();
    fieldKeys.add(candidate.fieldKey);
    byContextFieldKey.set(candidate.context, fieldKeys);
    const contextMap = byContextAlias.get(candidate.context) ?? new Map<string, string>();
    if (!contextMap.has(candidate.alias)) contextMap.set(candidate.alias, candidate.fieldKey);
    byContextAlias.set(candidate.context, contextMap);
  });
  return normalizeReferenceNodes(value, { byAlias, byContextAlias, byContextFieldKey, byFieldKey });
}

function collectReferenceCandidates(value: unknown) {
  const candidates: ReferenceCandidate[] = [];
  walkDocumentJson(value, (node) => {
    const alias = referenceAlias(node.alias);
    const fieldKey = stringField(node.fieldKey);
    if (!alias || !fieldKey || isReferenceNode(node)) return;
    candidates.push({
      alias,
      fieldKey,
      context: slotContextLabel(node),
    });
  });
  return candidates;
}

function collectFieldModelKeys(value: unknown) {
  if (!isRecord(value)) return [];
  const keys = new Set<string>();
  const fields = value.fields;
  if (Array.isArray(fields)) {
    fields.forEach((field) => {
      if (!isRecord(field)) return;
      const key = stringField(field.fieldKey) || stringField(field.key);
      if (key) keys.add(key);
    });
  } else if (isRecord(fields)) {
    Object.keys(fields).forEach((key) => keys.add(key));
  }
  const formulas = value.formulas;
  if (isRecord(formulas)) {
    Object.keys(formulas).forEach((key) => keys.add(key));
  }
  return Array.from(keys);
}

function normalizeReferenceNodes(
  value: unknown,
  context: {
    byAlias: Map<string, string>;
    byContextAlias: Map<string, Map<string, string>>;
    byContextFieldKey: Map<string, Set<string>>;
    byFieldKey: Set<string>;
  },
): DomainValidationResult<unknown> {
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const normalized = normalizeReferenceNodes(item, context);
      if (normalized.ok === false) return failFrom(normalized);
      items.push(normalized.data);
    }
    return okCommand(items);
  }
  if (!isRecord(value)) return okCommand(value);
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === deprecatedFormulaKindKey) continue;
    const normalized = normalizeReferenceNodes(item, context);
    if (normalized.ok === false) return failFrom(normalized);
    next[key] = normalized.data;
  }
  if (!isReferenceNode(next)) return okCommand(next);

  const referenceFieldKey = stringField(next.referenceFieldKey);
  if (!referenceFieldKey && isLegacyBatchNumberReference(next)) {
    return okCommand({ ...next, slotKind: "plain", alias: "i" });
  }
  if (!referenceFieldKey) return failCommand("请输入引用来源编号", 400, "document.referenceFieldKey");
  const nodeContext = slotContextLabel(next);
  const fieldKeys = nodeContext ? context.byContextFieldKey.get(nodeContext) ?? new Set<string>() : context.byFieldKey;
  if (fieldKeys.has(referenceFieldKey) || context.byFieldKey.has(referenceFieldKey)) return okCommand({ ...next, referenceFieldKey });
  if (isSystemReference(referenceFieldKey)) return okCommand({ ...next, referenceFieldKey });

  const alias = referenceAlias(referenceFieldKey);
  if (!alias) return failCommand("请输入引用来源编号", 400, "document.referenceFieldKey");
  const resolved = nodeContext ? context.byContextAlias.get(nodeContext)?.get(alias) : context.byAlias.get(alias);
  if (!resolved) return failCommand(`本检测项目内不存在引用来源编号：${alias}`, 400, "document.referenceFieldKey");
  return okCommand({ ...next, referenceFieldKey: resolved });
}

function walkDocumentJson(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkDocumentJson(item, visit));
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  Object.values(value).forEach((item) => walkDocumentJson(item, visit));
}

function referenceAlias(value: unknown) {
  const text = stringField(value)?.toLowerCase();
  return text && referenceAliasPattern.test(text) ? text : "";
}

function isReferenceNode(node: Record<string, unknown>) {
  return node.slotKind === "reference" || !!stringField(node.referenceFieldKey);
}

function isLegacyBatchNumberReference(node: Record<string, unknown>) {
  return stringField(node.fieldKey) === "batch_number";
}

function isSystemReference(referenceFieldKey: string) {
  return referenceFieldKey.startsWith("auth/");
}

function slotContextLabel(node: Record<string, unknown>) {
  const metadata = isRecord(node.metadata) ? node.metadata : {};
  const source = isRecord(metadata.source) ? metadata.source : metadata;
  const product = stringField(source.productName);
  const stage = stringField(source.stageLabel);
  const sequence = stringField(source.sequence);
  const test = stringField(source.testName);
  return [product, stage, [sequence, test].filter(Boolean).join(" ")].filter(Boolean).join(" / ");
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildListTemplatesCommand(input: ListTemplatesInput): DomainValidationResult<ListTemplatesCommand> {
  const spaceId = positiveId(input.spaceId, "spaceId");
  if (spaceId.ok === false) return failFrom(spaceId);
  const status = optionalStatus(input.status);
  if (status.ok === false) return failFrom(status);
  const keyword = optionalText(input.keyword, 100, "keyword");
  if (keyword.ok === false) return failFrom(keyword);
  return okCommand({
    userId: input.userId,
    ...(spaceId.data !== undefined ? { spaceId: spaceId.data } : {}),
    ...(status.data !== undefined ? { status: status.data } : {}),
    ...(keyword.data !== undefined ? { keyword: keyword.data } : {}),
  });
}

export function buildTemplateIdCommand(input: TemplateIdInput): DomainValidationResult<TemplateIdCommand> {
  const templateId = positiveId(input.templateId, "templateId");
  if (templateId.ok === false) return failFrom(templateId);
  if (templateId.data === undefined) return failCommand("无效模板ID", 400, "templateId");
  return okCommand({ userId: input.userId, templateId: templateId.data });
}

export function buildSaveDraftCommand(input: SaveDraftInput): DomainValidationResult<SaveDraftCommand> {
  const templateId = positiveId(input.templateId, "templateId");
  if (templateId.ok === false) return failFrom(templateId);
  const spaceId = positiveId(input.spaceId, "spaceId");
  if (spaceId.ok === false) return failFrom(spaceId);
  const departmentId = positiveId(input.departmentId, "departmentId");
  if (departmentId.ok === false) return failFrom(departmentId);
  const spaceKind = optionalSpaceKind(input.spaceKind);
  if (spaceKind.ok === false) return failFrom(spaceKind);
  const title = optionalText(input.title, 120, "title");
  if (title.ok === false) return failFrom(title);
  const type = optionalText(input.type, 40, "type");
  if (type.ok === false) return failFrom(type);
  const payload = normalizeDocumentTemplatePayload(input.document, input.fieldModel);
  if (payload.ok === false) return failFrom(payload);
  const documentJson = jsonString(payload.data.document, "document");
  if (documentJson.ok === false) return failFrom(documentJson);
  const fieldModelJson = jsonString(payload.data.fieldModel, "fieldModel");
  if (fieldModelJson.ok === false) return failFrom(fieldModelJson);
  const sourceKind = nullableText(input.sourceKind, 80, "sourceKind");
  if (sourceKind.ok === false) return failFrom(sourceKind);
  const sourceProductKey = nullableText(input.sourceProductKey, 120, "sourceProductKey");
  if (sourceProductKey.ok === false) return failFrom(sourceProductKey);
  const stageKeys = sourceStageKeys(input.sourceStageKeys);
  if (stageKeys.ok === false) return failFrom(stageKeys);

  if (!templateId.data && !title.data) return failCommand("新建模板需要标题", 400, "title");

  return okCommand({
    userId: input.userId,
    ...(templateId.data !== undefined ? { templateId: templateId.data } : {}),
    ...(spaceId.data !== undefined ? { spaceId: spaceId.data } : {}),
    ...(departmentId.data !== undefined ? { departmentId: departmentId.data } : {}),
    ...(spaceKind.data !== undefined ? { spaceKind: spaceKind.data } : {}),
    data: {
      ...(title.data !== undefined ? { title: title.data } : {}),
      ...(type.data !== undefined ? { type: type.data } : {}),
      ...(documentJson.data !== undefined ? { documentJson: documentJson.data } : {}),
      ...(fieldModelJson.data !== undefined ? { fieldModelJson: fieldModelJson.data } : {}),
      ...(sourceKind.data !== undefined ? { sourceKind: sourceKind.data } : {}),
      ...(sourceProductKey.data !== undefined ? { sourceProductKey: sourceProductKey.data } : {}),
      ...(stageKeys.data !== undefined ? { sourceStageKeys: stageKeys.data } : {}),
    },
  });
}

export function buildCopyTemplateCommand(input: CopyTemplateInput): DomainValidationResult<CopyTemplateCommand> {
  const base = buildTemplateIdCommand(input);
  if (base.ok === false) return failFrom(base);
  const targetSpaceId = positiveId(input.targetSpaceId, "targetSpaceId");
  if (targetSpaceId.ok === false) return failFrom(targetSpaceId);
  const targetDepartmentId = positiveId(input.targetDepartmentId, "targetDepartmentId");
  if (targetDepartmentId.ok === false) return failFrom(targetDepartmentId);
  const title = optionalText(input.title, 120, "title");
  if (title.ok === false) return failFrom(title);
  return okCommand({
    ...base.data,
    ...(targetSpaceId.data !== undefined ? { targetSpaceId: targetSpaceId.data } : {}),
    ...(targetDepartmentId.data !== undefined ? { targetDepartmentId: targetDepartmentId.data } : {}),
    ...(title.data !== undefined ? { title: title.data } : {}),
  });
}
