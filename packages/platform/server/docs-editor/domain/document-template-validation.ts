import {
  failCommand,
  okCommand,
  type DomainValidationIssue,
  type DomainValidationResult,
} from "../../domain-validation";
import {
  DOCS_EDITOR_PERMISSION_ROLES,
  DOCS_EDITOR_SPACE_KINDS,
  DOCS_EDITOR_TEMPLATE_STATUSES,
  type DocsEditorPermissionRole,
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

export interface UpdatePermissionsInput extends TemplateIdInput {
  permissions: Array<{ userId: number; role: string }>;
}

export interface MarkPublishedInput extends TemplateIdInput {
  official?: boolean | null;
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

export type UpdatePermissionsCommand = {
  userId: number;
  templateId: number;
  permissions: Array<{ userId: number; role: DocsEditorPermissionRole }>;
};

export type MarkPublishedCommand = {
  userId: number;
  templateId: number;
  official: boolean;
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

function role(value: string) {
  if (DOCS_EDITOR_PERMISSION_ROLES.includes(value as DocsEditorPermissionRole)) {
    return okCommand(value as DocsEditorPermissionRole);
  }
  return failCommand("权限角色无效", 400, "role");
}

function sourceStageKeys(value: string[] | null | undefined) {
  if (value === undefined) return okCommand(undefined);
  if (value === null) return okCommand(null);
  const normalized = Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
  if (normalized.length > 100) return failCommand("阶段数量过多", 400, "sourceStageKeys");
  return okCommand(JSON.stringify(normalized));
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
  const documentJson = jsonString(input.document, "document");
  if (documentJson.ok === false) return failFrom(documentJson);
  const fieldModelJson = jsonString(input.fieldModel, "fieldModel");
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

export function buildUpdatePermissionsCommand(input: UpdatePermissionsInput): DomainValidationResult<UpdatePermissionsCommand> {
  const base = buildTemplateIdCommand(input);
  if (base.ok === false) return failFrom(base);
  if (input.permissions.length > 100) return failCommand("授权用户过多", 400, "permissions");
  const seen = new Set<number>();
  const permissions: UpdatePermissionsCommand["permissions"] = [];
  for (const item of input.permissions) {
    const userId = positiveId(item.userId, "userId");
    if (userId.ok === false) return failFrom(userId);
    if (userId.data === undefined) return failCommand("无效用户ID", 400, "userId");
    if (seen.has(userId.data)) return failCommand("授权用户重复", 400, "permissions");
    const parsedRole = role(item.role);
    if (parsedRole.ok === false) return failFrom(parsedRole);
    seen.add(userId.data);
    permissions.push({ userId: userId.data, role: parsedRole.data });
  }
  return okCommand({ ...base.data, permissions });
}

export function buildMarkPublishedCommand(input: MarkPublishedInput): DomainValidationResult<MarkPublishedCommand> {
  const base = buildTemplateIdCommand(input);
  if (base.ok === false) return failFrom(base);
  return okCommand({ ...base.data, official: Boolean(input.official) });
}
