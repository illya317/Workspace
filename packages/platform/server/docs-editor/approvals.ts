import "server-only";

import {
  listRequests,
  type ApprovalAdapter,
  type ApprovalHandlerSource,
  type ApprovalOperation,
  type ApprovalRequestDto,
  type ApprovalRequestRecord,
  type ApprovalStatus,
} from "../approvals";
import { bindApprovalLifecycle } from "../approval-lifecycle";
import { serviceError, serviceOk } from "../api";
import { resolveWorkflowNodeHandlerUserIds } from "../approvals/workflow-node-handlers";
import { listDepartmentResponsibleUserIds, listDirectManagerUserIds } from "../business-space-natural-users";
import { failCommand, okCommand } from "../domain-validation";
import { prisma } from "../prisma";
import {
  buildSaveDraftCommand,
  type SaveDraftInput,
} from "./domain/document-template-validation";
import { docsEditorDb, type DocsEditorSpaceRow } from "./db";
import {
  canApproveDocsEditorTemplateAction,
  canSubmitDocsEditorTemplateAction,
  docsEditorScopeId,
  getDocsEditorPermissionResourceKey,
  resolveSpaceAccess,
} from "./permissions";
import { publishTemplateSnapshot } from "./publish-service";
import { saveDraft } from "./service";
import { resolveTargetSpace } from "./space-service";
import { consumeApprovalCommitAuthorization } from "../approval-commit-authorization";

export type DocsTemplateWorkflowAction = "draft.create" | "draft.save" | "publish";

export type DocsTemplateApprovalPayload = {
  action: DocsTemplateWorkflowAction;
  targetType: "company" | "committee" | "department";
  targetId: number;
  templateId: number | null;
  data: Record<string, unknown>;
};

type DocsTemplateSubmissionBody = {
  action?: string | null;
  operation?: ApprovalOperation | null;
  targetType?: string | null;
  targetId?: number | null;
  templateId?: number | null;
  payload?: Record<string, unknown>;
  comment?: string | null;
};

type DocsTemplateSubmissionActionBody = {
  version?: number | null;
  payload?: Record<string, unknown>;
  comment?: string | null;
};

const DOCS_TEMPLATE_SUBJECT = "docs.editor.template";

export const docsTemplateApprovalAdapter: ApprovalAdapter<DocsTemplateApprovalPayload> = {
  subjectType: DOCS_TEMPLATE_SUBJECT,
  workflowDefaults: ({ prepared, request }) => ({
    businessActionKey: businessActionKeyFor(prepared?.payload ?? request?.latestPayload ?? null),
    mode: "optional",
    flowType: "publish",
    separationPolicy: "auto_pass_if_authorized",
    handlerSource: "permission",
  }),
  validatePayload: ({ actorUserId, operation, subjectId, payload }) => validateDocsTemplatePayload({
    actorUserId,
    operation,
    subjectId,
    payload,
  }),
  resolveAccess: async ({ actorUserId, action, prepared, request }) => {
    const target = prepared?.payload ?? request?.latestPayload ?? targetFromScope(request?.scopeId);
    if (!target) return false;
    const space = await spaceFromTarget(target);
    if (!space) return false;
    if (action === "listRequests") return resolveSpaceAccess(actorUserId, space);
    if (action === "createDraft") return canSubmitDocsEditorTemplateAction(actorUserId, space);
    if (action === "reviewUpdate" || action === "approve" || action === "reject") {
      return Boolean(request && await canProcessDocsTemplateRequest(actorUserId, request));
    }
    if (action === "comment") {
      return Boolean(request && (
        request.submitterUserId === actorUserId ||
        await canProcessDocsTemplateRequest(actorUserId, request)
      ));
    }
    return false;
  },
  resolveHandlers: async ({ handlerSource, request }) =>
    resolveDocsTemplateHandlerUserIds(handlerSource, request),
  resolveRecipients: async ({ eventType, actorUserId, request }) => {
    if (eventType === "submit") return resolveDocsTemplateHandlerUserIds(request.handlerSource, request, actorUserId);
    if (eventType === "approve" || eventType === "publish" || eventType === "reject") return [request.submitterUserId];
    if (eventType === "comment") {
      if (actorUserId === request.submitterUserId) return resolveDocsTemplateHandlerUserIds(request.handlerSource, request, actorUserId);
      return [request.submitterUserId];
    }
    return [];
  },
  describeRequest: ({ request }) => ({
    title: docsTemplateApprovalTitle(request.latestPayload),
    summary: docsTemplateApprovalSummary(request.latestPayload) || `模板流程 #${request.id}`,
    href: `/docs/editor?approvalId=${request.id}`,
  }),
  commitApprovedPayload: async ({ actorUserId, request, approvalAuthorization }) => {
    const payload = request.latestPayload;
    const space = await spaceFromTarget(payload);
    if (!space) return serviceError("模板空间不存在", 404);
    if (!(await canProcessDocsTemplateRequest(actorUserId, request))) return serviceError("无权限处理该模板流程", 403);
    const authorized = consumeApprovalCommitAuthorization({
      authorization: approvalAuthorization,
      requestId: request.id,
      requestVersion: request.version,
      businessActionKey: request.businessActionKey,
    });
    if (!authorized.ok) return authorized;
    const result = payload.action === "publish"
      ? await publishTemplateSnapshot({
          userId: actorUserId,
          templateId: payload.templateId ?? 0,
          version: payload.data.version as number,
          ...payload.data,
          updateGuard: "workflow-approved",
        })
      : await saveDraft({
          userId: request.submitterUserId,
          templateId: payload.templateId,
          ...payload.data,
          updateGuard: "workflow-approved",
        } as SaveDraftInput);
    if (!result.ok) return serviceError(result.error, result.status || 400);
    const template = result.data as { id?: unknown };
    if (!template.id) return serviceError("流程通过后未能取得模板 ID", 500);
    return serviceOk({ entityType: "docs.editor.template", entityId: String(template.id) });
  },
};

const docsTemplateApprovalLifecycle = bindApprovalLifecycle(docsTemplateApprovalAdapter);

export function buildListDocsTemplateSubmissionsRouteCommand(input: {
  userId: number;
  query: { targetType?: string | null; targetId?: number | null; status?: string | null };
}) {
  const targetType = normalizeTargetType(input.query.targetType);
  const targetId = nullablePositiveNumber(input.query.targetId);
  return okCommand({
    userId: input.userId,
    resourceKey: targetType ? getDocsTemplateApprovalResourceKey(targetType) : "docs.editor",
    scopeId: targetType && targetId ? docsEditorScopeId({ targetType, targetId }) : null,
    statuses: normalizeStatusFilter(input.query.status),
  });
}

export function executeListDocsTemplateSubmissionsRouteCommand(command: {
  userId: number;
  resourceKey: string;
  scopeId?: string | null;
  statuses?: ApprovalStatus[];
}) {
  return listRequests({
    adapter: docsTemplateApprovalAdapter,
    actorUserId: command.userId,
    resourceKey: command.resourceKey,
    scopeId: command.scopeId,
    statuses: command.statuses,
  });
}

export function buildCreateDocsTemplateSubmissionRouteCommand(input: {
  userId: number;
  body: DocsTemplateSubmissionBody;
}) {
  const action = normalizeWorkflowAction(input.body.action);
  const operation: ApprovalOperation = action === "draft.create" ? "create" : "update";
  const templateId = nullablePositiveNumber(input.body.templateId);
  if (action !== "draft.create" && !templateId) return failCommand("模板 ID 无效", 400, "templateId");
  return okCommand({
    actorUserId: input.userId,
    operation,
    subjectId: templateId ? String(templateId) : null,
    payload: {
      action,
      templateId,
      targetType: normalizeTargetType(input.body.targetType),
      targetId: nullablePositiveNumber(input.body.targetId),
      data: input.body.payload ?? {},
    },
    comment: input.body.comment ?? null,
  });
}

export function executeCreateDocsTemplateSubmissionRouteCommand(command: {
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: unknown;
  comment?: string | null;
}) {
  return docsTemplateApprovalLifecycle.createDraft(command);
}

export function buildDocsTemplateSubmissionActionRouteCommand(input: {
  userId: number;
  requestId: number;
  body?: DocsTemplateSubmissionActionBody;
}) {
  return okCommand({
    actorUserId: input.userId,
    requestId: input.requestId,
    payload: input.body?.payload,
    comment: input.body?.comment ?? null,
    expectedVersion: input.body?.version ?? null,
  });
}

export async function executeReviseDocsTemplateSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  payload?: Record<string, unknown>;
  comment?: string | null;
  expectedVersion?: number | null;
}) {
  return docsTemplateApprovalLifecycle.revise(command, mergeDocsTemplateSubmissionPayload);
}

export function executeSubmitDocsTemplateSubmissionRouteCommand(command: DocsTemplateActionCommand) {
  return docsTemplateApprovalLifecycle.submit(command);
}

export function executeWithdrawDocsTemplateSubmissionRouteCommand(command: DocsTemplateActionCommand) {
  return docsTemplateApprovalLifecycle.withdraw(command);
}

export function executeCancelDocsTemplateSubmissionRouteCommand(command: DocsTemplateActionCommand) {
  return docsTemplateApprovalLifecycle.cancel(command);
}

export function executeCommentDocsTemplateSubmissionRouteCommand(command: DocsTemplateActionCommand) {
  return docsTemplateApprovalLifecycle.comment(command);
}

export async function executeApproveDocsTemplateSubmissionRouteCommand(command: DocsTemplateActionCommand) {
  return docsTemplateApprovalLifecycle.approve(command);
}

export function executeRejectDocsTemplateSubmissionRouteCommand(command: DocsTemplateActionCommand) {
  return docsTemplateApprovalLifecycle.reject(command);
}

type DocsTemplateActionCommand = {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
};

async function validateDocsTemplatePayload(input: {
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: unknown;
}) {
  const payload = await normalizeDocsTemplatePayload(input);
  if (!payload.ok) return payload;
  return serviceOk({
    resourceKey: getDocsTemplateApprovalResourceKey(payload.data.targetType),
    scopeId: docsEditorScopeId(payload.data),
    subjectId: payload.data.templateId ? String(payload.data.templateId) : null,
    businessActionKey: businessActionKeyFor(payload.data),
    flowType: "publish" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: payload.data,
  });
}

async function normalizeDocsTemplatePayload(input: {
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: unknown;
}) {
  if (!input.payload || typeof input.payload !== "object") return serviceError("流程草稿无效", 400);
  const raw = input.payload as Partial<DocsTemplateApprovalPayload> & {
    data?: Record<string, unknown>;
  };
  const action = normalizeWorkflowAction(raw.action);
  const templateId = nullablePositiveNumber(raw.templateId ?? input.subjectId);
  if (action !== "draft.create" && !templateId) return serviceError("模板 ID 无效", 400);
  if (action === "publish") {
    const publishData = omitDraftTargetFields(raw.data);
    const command = buildSaveDraftCommand({
      userId: input.actorUserId,
      templateId: templateId ?? 0,
      ...publishData,
    });
    if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
    const publishTemplateId = command.data.templateId;
    const publishVersion = command.data.expectedVersion;
    if (!publishTemplateId || publishVersion === undefined) return serviceError("模板 ID 或版本无效", 400);
    if (command.data.data.documentJson === undefined || command.data.data.fieldModelJson === undefined) {
      return serviceError("提交发布流程需要完整模板快照", 400);
    }
    const target = await targetFromTemplateId(publishTemplateId);
    if (!target) return serviceError("模板不存在", 404);
    return serviceOk({
      action,
      targetType: target.targetType,
      targetId: target.targetId,
      templateId: publishTemplateId,
      data: {
        ...publishData,
        version: publishVersion,
      },
    } satisfies DocsTemplateApprovalPayload);
  }

  const draftTargetInput = action === "draft.create" ? saveDraftTargetInput(raw) : {};
  const draftData = action === "draft.create" ? {
    ...omitDraftTargetFields(raw.data),
    ...draftTargetInput,
  } : raw.data ?? {};
  const draftInput = {
    userId: input.actorUserId,
    templateId: action === "draft.create" ? undefined : templateId,
    ...draftData,
  } as SaveDraftInput;
  const command = buildSaveDraftCommand(draftInput);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const target = action === "draft.create"
    ? await resolveTargetSpace(command.data, docsEditorDb())
    : await targetFromTemplateId(templateId ?? 0);
  if (!target) return serviceError(action === "draft.create" ? "目标空间不存在" : "模板不存在", 404);
  return serviceOk({
    action,
    targetType: normalizeTargetType(target.targetType)!,
    targetId: target.targetId,
    templateId: action === "draft.create" ? null : templateId,
    data: draftData,
  } satisfies DocsTemplateApprovalPayload);
}

async function targetFromTemplateId(templateId: number) {
  const db = docsEditorDb();
  const template = await db.documentTemplate.findFirst({ where: { id: templateId, deletedAt: null } });
  if (!template) return null;
  const space = await db.documentTemplateSpace.findUnique({ where: { id: template.spaceId } });
  return space && normalizeTargetType(space.targetType) ? space as DocsEditorSpaceRow & DocsTemplateTarget : null;
}

async function spaceFromTarget(target: Pick<DocsTemplateApprovalPayload, "targetType" | "targetId">) {
  const targetType = normalizeTargetType(target.targetType);
  if (!targetType) return null;
  return docsEditorDb().documentTemplateSpace.findFirst({
    where: { targetType, targetId: target.targetId, deletedAt: null },
  });
}

function mergeDocsTemplateSubmissionPayload(
  request: ApprovalRequestDto<DocsTemplateApprovalPayload>,
  nextData: Record<string, unknown>,
): DocsTemplateApprovalPayload {
  return { ...request.latestPayload, data: nextData };
}

function getDocsTemplateApprovalResourceKey(targetType: DocsTemplateApprovalPayload["targetType"]) {
  const resourceKey = getDocsEditorPermissionResourceKey(targetType);
  if (resourceKey === "docs.editor") throw new Error(`Missing derived template space resource for ${targetType}`);
  return resourceKey;
}

function businessActionKeyFor(payload: Partial<DocsTemplateApprovalPayload> | null | undefined) {
  const baseKey = payload?.action === "draft.create"
    ? "docs.editor.template.draft.create"
    : payload?.action === "publish"
      ? "docs.editor.template.publish"
      : "docs.editor.template.draft.save";
  return baseKey;
}

function docsTemplateApprovalTitle(payload: DocsTemplateApprovalPayload) {
  if (payload.action === "draft.create") return "文档模板新建发布流程";
  if (payload.action === "publish") return "文档模板发布流程";
  return "文档模板草稿保存流程";
}

function docsTemplateApprovalSummary(payload: DocsTemplateApprovalPayload) {
  return String(payload.data.title || payload.data.type || payload.templateId || "").trim();
}

function normalizeWorkflowAction(value: unknown): DocsTemplateWorkflowAction {
  if (value === "draft.create" || value === "create") return "draft.create";
  if (value === "publish") return "publish";
  return "draft.save";
}

function saveDraftTargetInput(raw: Partial<DocsTemplateApprovalPayload>): Pick<SaveDraftInput, "spaceKind" | "departmentId"> {
  const targetType = normalizeTargetType(raw.targetType);
  const targetId = nullablePositiveNumber(raw.targetId);
  if (targetType === "department") return { spaceKind: "department", departmentId: targetId ?? undefined };
  if (targetType === "company" || targetType === "committee") return { spaceKind: targetType };
  return {};
}

function omitDraftTargetFields(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const { spaceId: _spaceId, spaceKind: _spaceKind, departmentId: _departmentId, ...rest } = value ?? {};
  return rest;
}

function normalizeTargetType(value: unknown): DocsTemplateApprovalPayload["targetType"] | null {
  if (value === "company" || value === "committee" || value === "department") return value;
  return null;
}

function nullablePositiveNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function targetFromScope(scopeId: string | null | undefined): DocsTemplateTarget | null {
  if (!scopeId) return null;
  const [targetType, idText] = scopeId.split(":");
  const normalized = normalizeTargetType(targetType);
  const targetId = Number(idText);
  return normalized && Number.isInteger(targetId) && targetId > 0 ? { targetType: normalized, targetId } : null;
}

function normalizeStatusFilter(value: string | null | undefined): ApprovalStatus[] | undefined {
  if (!value) return undefined;
  const allowed = new Set<ApprovalStatus>(["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled"]);
  const statuses = value.split(",").map((item) => item.trim()).filter((item): item is ApprovalStatus => allowed.has(item as ApprovalStatus));
  return statuses.length ? statuses : undefined;
}

async function canProcessDocsTemplateRequest(
  actorUserId: number,
  request: ApprovalRequestRecord<DocsTemplateApprovalPayload>,
) {
  const handlers = await resolveDocsTemplateHandlerUserIds(request.handlerSource, request);
  return handlers.includes(actorUserId);
}

async function resolveDocsTemplateHandlerUserIds(
  handlerSource: ApprovalHandlerSource,
  request: ApprovalRequestRecord<DocsTemplateApprovalPayload>,
  excludeUserId: number | null = null,
): Promise<number[]> {
  const payload = request.latestPayload;
  if (request.activeWorkflowNodeKey) {
    return resolveWorkflowNodeHandlerUserIds(request, {
      excludeUserId,
      resolveRelationship: (source): Promise<number[]> => resolveDocsTemplateHandlerUserIds(source, { ...request, activeWorkflowNodeKey: null }, excludeUserId),
      resolvePermission: () => listDocsTemplateApproverUserIds(payload, excludeUserId),
    });
  }
  if (handlerSource === "direct_manager") {
    return filterUserIds(await listDirectManagerUserIds(request.submitterUserId), excludeUserId);
  }
  if (handlerSource === "department_owner" && payload.targetType === "department") {
    return filterUserIds(await listDepartmentResponsibleUserIds(payload.targetId), excludeUserId);
  }
  if (handlerSource === "department_owner") return [];
  return listDocsTemplateApproverUserIds(payload, excludeUserId);
}

async function listDocsTemplateApproverUserIds(payload: DocsTemplateApprovalPayload, excludeUserId: number | null) {
  const space = await spaceFromTarget(payload);
  if (!space) return [];
  const users = await prisma.user.findMany({
    where: { canLogin: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  const allowed = await Promise.all(users.map(async (user) => (
    await canApproveDocsEditorTemplateAction(user.id, space) ? user.id : null
  )));
  return allowed.filter((id): id is number => id !== null);
}

function filterUserIds(userIds: number[], excludeUserId: number | null) {
  return Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0 && id !== excludeUserId)));
}

type DocsTemplateTarget = Pick<DocsTemplateApprovalPayload, "targetType" | "targetId">;
