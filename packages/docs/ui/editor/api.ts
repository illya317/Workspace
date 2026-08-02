"use client";

import { requestJson } from "@workspace/platform/ui/api-client";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";

export type EditorSpaceKind = "personal" | "company" | "committee" | "department";
export type EditorTemplateStatus = "draft" | "published" | "archived";

export interface EditorSpaceActionPermissions {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canPublish: boolean;
  canExport: boolean;
  canManagePermissions: boolean;
}

export interface EditorSpaceDto {
  id: string;
  kind: EditorSpaceKind;
  targetType: EditorSpaceKind;
  targetId: number;
  title: string;
  description?: string;
  departmentId?: number | null;
  actionPermissions: EditorSpaceActionPermissions;
  actionRuntimes: {
    create: ActionRuntime;
    save: ActionRuntime;
    publish: ActionRuntime;
  };
}

export interface EditorTemplateListItemDto {
  id: string;
  title: string;
  type: string;
  status: EditorTemplateStatus;
  spaceId: string;
  version: number;
  updatedAt: string;
  sourceKind?: string | null;
  sourceProductKey?: string | null;
  stageCount?: number;
  fieldCount?: number;
  formulaCount?: number;
  tableCount?: number;
  actionPermissions: EditorSpaceActionPermissions;
}

export interface EditorTemplateDetailDto extends EditorTemplateListItemDto {
  document: unknown;
  fieldModel: unknown;
}

export interface EditorBootstrapDto {
  spaces: EditorSpaceDto[];
  templates: EditorTemplateListItemDto[];
}

export type EditorTemplateWorkflowStatus =
  | "draft"
  | "submitted"
  | "committing"
  | "withdrawn"
  | "rejected"
  | "approved"
  | "cancelled";

export interface EditorTemplateWorkflowPayload {
  action: "draft.create" | "draft.save" | "publish";
  targetType: "company" | "committee" | "department";
  targetId: number;
  templateId: number | null;
  data: Record<string, unknown>;
}

export interface EditorTemplateWorkflowEvent {
  id: number;
  sequence: number;
  eventType: string;
  actorUserId: number;
  actorName: string;
  fromStatus: EditorTemplateWorkflowStatus | null;
  toStatus: EditorTemplateWorkflowStatus | null;
  comment: string | null;
  payloadSnapshot: EditorTemplateWorkflowPayload | null;
  createdAt: string;
}

export interface EditorTemplateWorkflowRequest {
  id: number;
  resourceKey: string;
  scopeId: string | null;
  businessActionKey: string;
  flowType: "approval" | "review" | "publish";
  separationPolicy: "independent_required"  | "auto_pass_if_authorized";
  handlerSource: "direct_manager" | "department_owner" | "permission";
  handlerCanRevise: boolean;
  subjectType: string;
  subjectId: string | null;
  operation: "create" | "update";
  status: EditorTemplateWorkflowStatus;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  latestPayload: EditorTemplateWorkflowPayload;
  submitterUserId: number;
  submitterName: string;
  submittedAt: string | null;
  resolvedByUserId: number | null;
  resolvedAt: string | null;
  committedEntityType: string | null;
  committedEntityId: string | null;
  committedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  events: EditorTemplateWorkflowEvent[];
  canProcess?: boolean;
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

export type EditorTemplateMutationOutcome =
  | { executionMode: "direct"; template: EditorTemplateDetailDto }
  | { executionMode: "workflow"; request: EditorTemplateWorkflowRequest };

export function saveEditorTemplateDraft(templateId: string, body: { version: number; document: unknown; fieldModel: unknown; title?: string }) {
  return requestJson<EditorTemplateMutationOutcome>(`${API_PREFIX}/templates/${encodeURIComponent(templateId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
    fallbackMessage: "保存模板草稿失败",
  });
}

export function publishEditorTemplateDraft(templateId: string, body: {
  version: number;
  title: string;
  type: string;
  document: unknown;
  fieldModel: unknown;
  sourceKind?: string | null;
  sourceProductKey?: string | null;
  sourceStageKeys?: string[] | null;
}) {
  return requestJson<EditorTemplateMutationOutcome>(`${API_PREFIX}/templates/${encodeURIComponent(templateId)}/publish`, {
    method: "POST",
    body: JSON.stringify(body),
    fallbackMessage: "发布模板失败",
  });
}

export function archiveEditorTemplate(templateId: string, body: { version: number }) {
  return requestJson<EditorTemplateDetailDto>(`${API_PREFIX}/templates/${encodeURIComponent(templateId)}/archive`, {
    method: "POST",
    body: JSON.stringify(body),
    fallbackMessage: "归档模板失败",
  });
}

export function deleteEditorTemplateDraft(templateId: string, body: { version: number }) {
  return requestJson<{ id: string }>(`${API_PREFIX}/templates/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
    body: JSON.stringify(body),
    fallbackMessage: "删除模板失败",
  });
}

export function createEditorTemplateDraft(body: {
  spaceId?: string | null;
  departmentId?: number | null;
  spaceKind?: "personal" | "company" | "committee" | "department" | null;
  title: string;
  type: string;
  document: unknown;
  fieldModel: unknown;
  sourceKind?: string | null;
  sourceProductKey?: string | null;
  sourceStageKeys?: string[] | null;
}) {
  return requestJson<EditorTemplateMutationOutcome>(API_PREFIX, {
    method: "POST",
    body: JSON.stringify(body),
    fallbackMessage: "创建模板草稿失败",
  });
}

export function listEditorTemplateSubmissions(target?: {
  targetType: "company" | "committee" | "department";
  targetId: number;
} | null) {
  const params = new URLSearchParams();
  if (target) {
    params.set("targetType", target.targetType);
    params.set("targetId", String(target.targetId));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<{ requests?: EditorTemplateWorkflowRequest[] }>(`${API_PREFIX}/submissions${suffix}`, {
    fallbackMessage: "加载模板流程失败",
  });
}

function runEditorTemplateSubmissionAction(
  id: number,
  action: "submit" | "withdraw" | "cancel" | "approve" | "reject" | "comment",
  body: { version?: number | null; comment?: string | null },
) {
  return requestJson<{ request: EditorTemplateWorkflowRequest }>(`${API_PREFIX}/submissions/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
    fallbackMessage: "模板流程操作失败",
  });
}

export function submitEditorTemplateSubmission(id: number, version?: number | null, comment?: string | null) {
  return runEditorTemplateSubmissionAction(id, "submit", { version, comment });
}

export function withdrawEditorTemplateSubmission(id: number, version?: number | null, comment?: string | null) {
  return runEditorTemplateSubmissionAction(id, "withdraw", { version, comment });
}

export function cancelEditorTemplateSubmission(id: number, version?: number | null, comment?: string | null) {
  return runEditorTemplateSubmissionAction(id, "cancel", { version, comment });
}

export function approveEditorTemplateSubmission(id: number, version?: number | null, comment?: string | null) {
  return runEditorTemplateSubmissionAction(id, "approve", { version, comment });
}

export function rejectEditorTemplateSubmission(id: number, version?: number | null, comment?: string | null) {
  return runEditorTemplateSubmissionAction(id, "reject", { version, comment });
}

export function commentEditorTemplateSubmission(id: number, comment: string, version?: number | null) {
  return runEditorTemplateSubmissionAction(id, "comment", { version, comment });
}

export function reviseEditorTemplateSubmission(
  id: number,
  payload: Record<string, unknown>,
  version?: number | null,
  comment?: string | null,
) {
  return requestJson<{ request: EditorTemplateWorkflowRequest }>(`${API_PREFIX}/submissions/${id}`, {
    method: "PUT",
    body: JSON.stringify({ payload, version, comment }),
    fallbackMessage: "保存处理修改失败",
  });
}
