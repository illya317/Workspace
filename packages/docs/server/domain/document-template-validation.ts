import {
  failCommand,
  okCommand,
  type DomainValidationIssue,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import {
  normalizeDocumentTemplatePayload as normalizePlatformDocumentTemplatePayload,
} from "@workspace/platform/document-editor/document-template-validation";
import {
  DOCS_EDITOR_SPACE_KINDS,
  DOCS_EDITOR_TEMPLATE_STATUSES,
  type DocsEditorSpaceKind,
  type DocsEditorTemplateStatus,
} from "../types";

export interface ListTemplatesInput {
  userId: number;
  spaceId?: number | string | null;
  status?: string | null;
  keyword?: string | null;
}

export interface TemplateIdInput {
  userId: number;
  templateId: number | string;
  version?: number | string | null;
  updateGuard?: "workflow-approved";
}

export interface SaveDraftInput {
  userId: number;
  templateId?: number | string | null;
  version?: number | string | null;
  updateGuard?: "workflow-approved";
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
  expectedVersion?: number;
  updateGuard?: "workflow-approved";
};

export type SaveDraftCommand = {
  userId: number;
  templateId?: number;
  expectedVersion?: number;
  updateGuard?: "workflow-approved";
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

export function normalizeDocumentTemplatePayload(
  document: unknown,
  fieldModel: unknown,
): DomainValidationResult<{ document: unknown; fieldModel: unknown }> {
  return normalizePlatformDocumentTemplatePayload(document, fieldModel);
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
  const version = positiveId(input.version, "version");
  if (version.ok === false) return failFrom(version);
  return okCommand({
    userId: input.userId,
    templateId: templateId.data,
    ...(version.data !== undefined ? { expectedVersion: version.data } : {}),
    ...(input.updateGuard === "workflow-approved" ? { updateGuard: input.updateGuard } : {}),
  });
}

export function buildSaveDraftCommand(input: SaveDraftInput): DomainValidationResult<SaveDraftCommand> {
  const templateId = positiveId(input.templateId, "templateId");
  if (templateId.ok === false) return failFrom(templateId);
  const version = positiveId(input.version, "version");
  if (version.ok === false) return failFrom(version);
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
  if (templateId.data && version.data === undefined) return failCommand("缺少模板版本", 400, "version");

  return okCommand({
    userId: input.userId,
    ...(templateId.data !== undefined ? { templateId: templateId.data } : {}),
    ...(version.data !== undefined ? { expectedVersion: version.data } : {}),
    ...(input.updateGuard === "workflow-approved" ? { updateGuard: input.updateGuard } : {}),
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
