"use client";

import { requestJson } from "../../api-client";

export type EditorSpaceKind = "personal" | "company" | "department";
export type EditorTemplateStatus = "draft" | "published" | "archived";
export type EditorPermissionRole = "viewer" | "editor" | "delete" | "manager";

export interface EditorSpaceDto {
  id: string;
  kind: EditorSpaceKind;
  targetType: EditorSpaceKind;
  targetId: number;
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
}

export interface EditorSpacePermissionRow {
  userId: number;
  userName: string;
  role: EditorPermissionRole;
  kind: "template";
  source: "natural" | "explicit";
  locked: boolean;
}

export interface EditorBootstrapDto {
  spaces: EditorSpaceDto[];
  templates: EditorTemplateListItemDto[];
}

const API_PREFIX = "/api/modules/docs/editor";
export const DOCS_EDITOR_REFERENCE_OPTIONS_ENDPOINT = `${API_PREFIX}/reference-options`;

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

export function fetchEditorSpacePermissions(spaceId: string) {
  return requestJson<{ permissions?: EditorSpacePermissionRow[] }>(`${API_PREFIX}/spaces/${encodeURIComponent(spaceId)}/permissions`, {
    fallbackMessage: "加载模板空间权限失败",
  }).then((data) => data.permissions || []);
}

export function saveEditorSpacePermissions(spaceId: string, permissions: Array<{ userId: number; role: EditorPermissionRole }>) {
  return requestJson<{ success: true }>(`${API_PREFIX}/spaces/${encodeURIComponent(spaceId)}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions }),
    fallbackMessage: "保存模板空间权限失败",
  });
}
