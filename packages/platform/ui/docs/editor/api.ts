"use client";

import { requestJson } from "../../api-client";

export type EditorSpaceKind = "personal" | "department";
export type EditorTemplateStatus = "draft" | "reviewing" | "published" | "archived";
export type EditorPermissionRole = "viewer" | "editor" | "manager";

export interface EditorSpaceDto {
  id: string;
  kind: EditorSpaceKind;
  title: string;
  description?: string;
  departmentId?: number | null;
  role: EditorPermissionRole;
}

export interface EditorTemplateListItemDto {
  id: string;
  title: string;
  type: string;
  status: EditorTemplateStatus;
  spaceId: string;
  updatedAt: string;
  sourceKind?: string | null;
  sourceProductKey?: string | null;
  stageCount?: number;
  fieldCount?: number;
  formulaCount?: number;
  tableCount?: number;
  role: EditorPermissionRole;
}

export interface EditorTemplateDetailDto extends EditorTemplateListItemDto {
  document: unknown;
  fieldModel: unknown;
  permissions: Array<{
    id: string;
    userId: number;
    userName: string;
    role: EditorPermissionRole;
  }>;
}

export interface EditorBootstrapDto {
  spaces: EditorSpaceDto[];
  templates: EditorTemplateListItemDto[];
}

const API_PREFIX = "/api/modules/docs/editor";

export function fetchEditorBootstrap(spaceId?: string) {
  const suffix = spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : "";
  return requestJson<EditorBootstrapDto>(`${API_PREFIX}${suffix}`, {
    fallbackMessage: "加载模板编辑器失败",
  });
}

export function fetchEditorTemplate(templateId: string) {
  return requestJson<EditorTemplateDetailDto>(`${API_PREFIX}/templates/${encodeURIComponent(templateId)}`, {
    fallbackMessage: "加载模板详情失败",
  });
}

export function saveEditorTemplateDraft(templateId: string, body: { document: unknown; fieldModel: unknown; title?: string }) {
  return requestJson<EditorTemplateDetailDto>(`${API_PREFIX}/templates/${encodeURIComponent(templateId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
    fallbackMessage: "保存模板草稿失败",
  });
}

export function createEditorTemplateDraft(body: {
  spaceId?: string | null;
  departmentId?: number | null;
  spaceKind?: "personal" | "department" | null;
  title: string;
  type: string;
  document: unknown;
  fieldModel: unknown;
  sourceKind?: string | null;
  sourceProductKey?: string | null;
  sourceStageKeys?: string[] | null;
}) {
  return requestJson<EditorTemplateDetailDto>(API_PREFIX, {
    method: "POST",
    body: JSON.stringify(body),
    fallbackMessage: "创建模板草稿失败",
  });
}

export function copyEditorTemplate(templateId: string, body: { targetSpaceId?: string | null; title?: string | null }) {
  return requestJson<EditorTemplateDetailDto>(`${API_PREFIX}/templates/${encodeURIComponent(templateId)}/copy`, {
    method: "POST",
    body: JSON.stringify(body),
    fallbackMessage: "复制模板失败",
  });
}

export function updateEditorTemplatePermissions(templateId: string, permissions: Array<{ userId: number; role: EditorPermissionRole }>) {
  return requestJson<EditorTemplateDetailDto>(`${API_PREFIX}/templates/${encodeURIComponent(templateId)}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions }),
    fallbackMessage: "更新模版权限失败",
  });
}

export function requestEditorTemplatePublish(templateId: string) {
  return requestJson<EditorTemplateDetailDto>(`${API_PREFIX}/templates/${encodeURIComponent(templateId)}/publish-request`, {
    method: "POST",
    body: JSON.stringify({}),
    fallbackMessage: "提交发布申请失败",
  });
}

export function markEditorTemplatePublished(templateId: string, body: { official?: boolean } = {}) {
  return requestJson<EditorTemplateDetailDto>(`${API_PREFIX}/templates/${encodeURIComponent(templateId)}/publish`, {
    method: "POST",
    body: JSON.stringify(body),
    fallbackMessage: "发布模板失败",
  });
}
