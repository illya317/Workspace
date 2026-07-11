import {
  listRequests,
  type ApprovalOperation,
  type ApprovalStatus,
} from "@workspace/platform/server/approvals";
import { bindApprovalLifecycle } from "@workspace/platform/server/approval-lifecycle";
import { serviceError, serviceResponse } from "@workspace/platform/server/api";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import {
  requestInclude,
  toDto,
  toRecord,
  type ApprovalRequestRowWithEvents,
} from "@workspace/platform/server/approvals/serialization";
import {
  getWorkTaskApprovalResourceKey,
  mergeWorkTaskSubmissionPayload,
  normalizeApprovalTargetType,
  normalizeApprovalWorkspaceTargetType,
  workTaskApprovalAdapter,
  type WorkTaskApprovalEntityType,
  type WorkTaskApprovalPayload,
  type WorkTaskApprovalTargetType,
} from "./task-approval-adapter";
import {
  validateKrReviewApprovalPayload,
  validateObjectivePlanApprovalPayload,
} from "./task-approval-okr";
import {
  rejectKrReview,
  rejectObjectiveReview,
  submitKrReview,
  submitObjectiveReview,
} from "./work-okr-stage";
import { canProcessWorkTaskRequest } from "./task-approval-handlers";
import { workTaskScopeId } from "./task-spaces";
import { canViewWorkTaskTarget } from "./access";

const workTaskApprovalLifecycle = bindApprovalLifecycle(workTaskApprovalAdapter);

type WorkTaskApprovalBody = {
  operation: ApprovalOperation;
  targetType?: string;
  targetId?: number;
  workId?: number | null;
  planId?: number | null;
  reportId?: number | null;
  entityType?: WorkTaskApprovalEntityType | null;
  periodType?: string | null;
  periodStart?: string | null;
  reportStage?: "kr" | "final" | null;
  payload: Record<string, unknown>;
  comment?: string | null;
};

type WorkTaskApprovalActionBody = {
  payload?: Record<string, unknown>;
  comment?: string | null;
  version?: number | null;
};

type WorkTaskSubmissionsQuery = {
  targetType?: string;
  targetId?: number;
  status?: string;
  view?: "space" | "mine";
  filter?: "all" | "todo" | "originated";
};

type ListWorkTaskSubmissionsCommand =
  | {
      kind: "space";
      userId: number;
      targetType: WorkTaskApprovalTargetType;
      targetId: number;
      statuses?: ApprovalStatus[];
    }
  | {
      kind: "mine";
      userId: number;
      filter: "all" | "todo" | "originated";
      statuses?: ApprovalStatus[];
    };

export async function buildListWorkTaskSubmissionsRouteCommand(input: {
  userId: number;
  query: WorkTaskSubmissionsQuery;
}): Promise<DomainValidationResult<ListWorkTaskSubmissionsCommand>> {
  if (input.query.view === "mine") {
    return okCommand({
      kind: "mine" as const,
      userId: input.userId,
      filter: input.query.filter ?? "all",
      statuses: normalizeStatusFilter(input.query.status),
    });
  }
  const targetType = normalizeApprovalTargetType(input.query.targetType);
  if (!targetType) return failCommand("审批只支持组织工作空间", 400, "targetType");
  const targetId = normalizePositiveId(input.query.targetId, "工作空间");
  if (!targetId.ok) return targetId;
  if (!(await canViewWorkTaskTarget(input.userId, targetType, targetId.data))) {
    return failCommand("无权限访问该工作空间", 403);
  }
  return okCommand({
    kind: "space" as const,
    userId: input.userId,
    targetType,
    targetId: targetId.data,
    statuses: normalizeStatusFilter(input.query.status),
  });
}

export async function executeListWorkTaskSubmissionsRouteCommand(command: ListWorkTaskSubmissionsCommand) {
  if (command.kind === "mine") return listMyWorkTaskSubmissions(command);
  const result = await listRequests({
    adapter: workTaskApprovalAdapter,
    actorUserId: command.userId,
    resourceKey: getWorkTaskApprovalResourceKey(command.targetType),
    scopeId: workTaskScopeId(command.targetType, command.targetId),
    statuses: command.statuses,
  });
  return result.ok ? result.data : serviceResponse(result);
}

async function listMyWorkTaskSubmissions(command: Extract<ListWorkTaskSubmissionsCommand, { kind: "mine" }>) {
  const rows = await prisma.approvalRequest.findMany({
    where: {
      subjectType: "work.task",
      ...(command.statuses?.length ? { status: { in: command.statuses } } : {}),
      ...(command.filter === "todo" ? { status: "submitted" } : {}),
      ...(command.filter === "originated" ? { submitterUserId: command.userId } : {}),
    },
    include: requestInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  const requests = await Promise.all(rows.map(async (row) => {
    const dto = toDto<WorkTaskApprovalPayload>(row as ApprovalRequestRowWithEvents);
    const record = toRecord(row as ApprovalRequestRowWithEvents, dto.latestPayload);
    const canProcess = dto.status === "submitted" && await canProcessWorkTaskRequest(command.userId, record);
    const isOriginated = dto.submitterUserId === command.userId;
    const visible = command.filter === "todo"
      ? canProcess
      : command.filter === "originated"
        ? isOriginated
        : canProcess || isOriginated;
    return visible ? { ...dto, canProcess } : null;
  }));
  return { requests: requests.filter((request): request is NonNullable<typeof request> => Boolean(request)) };
}

export function buildCreateWorkTaskSubmissionRouteCommand(input: {
  userId: number;
  body: WorkTaskApprovalBody;
}) {
  const entityType = input.body.entityType || "item";
  const workspaceScoped = entityType === "plan" || entityType === "report" || entityType === "objective_plan" || entityType === "kr_review" || entityType === "revision" || entityType === "collaboration";
  const targetType = workspaceScoped
    ? normalizeApprovalWorkspaceTargetType(input.body.targetType)
    : normalizeApprovalTargetType(input.body.targetType);
  if (!targetType) return failCommand(workspaceScoped ? "审批工作空间无效" : "审批只支持组织工作空间", 400, "targetType");
  const targetId = normalizePositiveId(input.body.targetId, "工作空间");
  if (!targetId.ok) return targetId;
  return okCommand({
    actorUserId: input.userId,
    operation: input.body.operation,
    subjectId: submissionSubjectId(input.body),
    payload: {
      entityType,
      targetType,
      targetId: targetId.data,
      workId: input.body.workId ?? null,
      planId: input.body.planId ?? null,
      reportId: input.body.reportId ?? null,
      periodType: input.body.periodType ?? null,
      periodStart: input.body.periodStart ?? null,
      reportStage: input.body.reportStage ?? null,
      data: input.body.payload,
    } as WorkTaskApprovalPayload,
    comment: input.body.comment ?? null,
  });
}

export function executeCreateWorkTaskSubmissionRouteCommand(command: {
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: WorkTaskApprovalPayload;
  comment?: string | null;
}) {
  return workTaskApprovalLifecycle.createDraft(command);
}

export function buildWorkTaskSubmissionActionRouteCommand(input: {
  userId: number;
  requestId: number;
  body?: WorkTaskApprovalActionBody;
}) {
  return okCommand({
    actorUserId: input.userId,
    requestId: input.requestId,
    payload: input.body?.payload,
    comment: input.body?.comment ?? null,
    expectedVersion: input.body?.version ?? null,
  });
}

export function buildWorkTaskSubmissionViewRouteCommand(input: {
  userId: number;
  requestId: number;
}) {
  return okCommand({ actorUserId: input.userId, requestId: input.requestId });
}

export async function executeGetWorkTaskSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
}) {
  const row = await prisma.approvalRequest.findUnique({
    where: { id: command.requestId },
    include: requestInclude,
  });
  if (!row || row.subjectType !== workTaskApprovalAdapter.subjectType) return serviceError("审批单不存在", 404);
  const dto = toDto<WorkTaskApprovalPayload>(row as ApprovalRequestRowWithEvents);
  const record = toRecord(row as ApprovalRequestRowWithEvents, dto.latestPayload);
  const canProcess = dto.status === "submitted" && await canProcessWorkTaskRequest(command.actorUserId, record);
  if (!canProcess && dto.submitterUserId !== command.actorUserId) return serviceError("无权限查看审批单", 403);
  return { request: { ...dto, canProcess } };
}

export async function executeReviseWorkTaskSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  payload?: Record<string, unknown>;
  comment?: string | null;
  expectedVersion?: number | null;
}) {
  return workTaskApprovalLifecycle.revise(command, mergeWorkTaskSubmissionPayload, "缺少审批草稿");
}

export async function executeSubmitWorkTaskSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  const current = await workTaskApprovalLifecycle.getRequest(command.requestId);
  if (!current.ok) return current;
  const okrGuard = await assertOkrReviewCanSubmit(current.data.latestPayload);
  if (!okrGuard.ok) return okrGuard;
  const result = await workTaskApprovalLifecycle.submit(command);
  if (!result.ok) return result;
  if (result.data.request.status === "submitted") {
    const stage = await markOkrReviewSubmitted(current.data.latestPayload);
    if (!stage.ok) return serviceError(stage.error, stage.status || 400);
  }
  return result;
}

export async function executeWithdrawWorkTaskSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  const current = await workTaskApprovalLifecycle.getRequest(command.requestId);
  if (!current.ok) return current;
  const result = await workTaskApprovalLifecycle.withdraw(command);
  if (!result.ok) return result;
  if (current.data.status === "submitted") await reopenOkrReviewAfterSubmit(current.data.latestPayload);
  return result;
}

export async function executeCancelWorkTaskSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  const current = await workTaskApprovalLifecycle.getRequest(command.requestId);
  if (!current.ok) return current;
  const result = await workTaskApprovalLifecycle.cancel(command);
  if (!result.ok) return result;
  if (current.data.status === "submitted") await reopenOkrReviewAfterSubmit(current.data.latestPayload);
  return result;
}

export function executeCommentWorkTaskSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return workTaskApprovalLifecycle.comment(command);
}

export async function executeApproveWorkTaskSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return workTaskApprovalLifecycle.approve(command);
}

export async function executeRejectWorkTaskSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  const current = await workTaskApprovalLifecycle.getRequest(command.requestId);
  if (!current.ok) return current;
  const result = await workTaskApprovalLifecycle.reject(command);
  if (!result.ok) return result;
  await reopenOkrReviewAfterSubmit(current.data.latestPayload);
  return result;
}

function submissionSubjectId(body: WorkTaskApprovalBody) {
  if ((body.entityType === "objective_plan" || body.entityType === "kr_review") && body.planId) return String(body.planId);
  if (body.entityType === "plan" && body.planId) return String(body.planId);
  if (body.entityType === "report") {
    const periodType = body.periodType || String(body.payload.periodType || "weekly");
    const periodStart = body.periodStart || String(body.payload.periodStart || "");
    const reportStage = body.reportStage || (body.payload.reportStage === "kr" ? "kr" : "final");
    return periodStart ? `report:${body.targetType || "unknown"}:${body.targetId || "unknown"}:${periodType}:${periodStart}:${reportStage}` : null;
  }
  if (body.workId) return String(body.workId);
  return null;
}

async function markOkrReviewSubmitted(payload: WorkTaskApprovalPayload) {
  if (payload.data.packageOnly) return { ok: true as const, data: null };
  if (payload.entityType === "objective_plan") return submitObjectiveReview(payload.planId);
  if (payload.entityType === "kr_review") return submitKrReview(payload.planId);
  return { ok: true as const, data: null };
}

async function assertOkrReviewCanSubmit(payload: WorkTaskApprovalPayload) {
  if (payload.entityType === "objective_plan") {
    const result = await validateObjectivePlanApprovalPayload(payload, String(payload.planId));
    return result.ok ? { ok: true as const, data: null } : result;
  }
  if (payload.entityType === "kr_review") {
    const result = await validateKrReviewApprovalPayload(payload, String(payload.planId));
    return result.ok ? { ok: true as const, data: null } : result;
  }
  return { ok: true as const, data: null };
}

async function reopenOkrReviewAfterSubmit(payload: WorkTaskApprovalPayload) {
  if (payload.data.packageOnly) return { ok: true as const, data: null };
  if (payload.entityType === "objective_plan") return rejectObjectiveReview(payload.planId);
  if (payload.entityType === "kr_review") return rejectKrReview(payload.planId);
  return { ok: true as const, data: null };
}

function normalizePositiveId(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return failCommand(`${label}无效`, 400);
  return okCommand(number);
}

function normalizeStatusFilter(status: string | null | undefined): ApprovalStatus[] | undefined {
  if (!status) return undefined;
  const values = status.split(",").map((item) => item.trim()).filter(Boolean);
  const allowed = new Set<ApprovalStatus>(["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled"]);
  const statuses = values.filter((value): value is ApprovalStatus => allowed.has(value as ApprovalStatus));
  return statuses.length ? statuses : undefined;
}
