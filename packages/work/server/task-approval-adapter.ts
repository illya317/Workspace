import { type ApprovalAdapter, type ApprovalOperation } from "@workspace/platform/server/approvals";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { canViewWorkTaskTarget, canSubmitWorkTaskAction } from "./access";
import { buildWorkItemCreateCommand, buildWorkItemUpdateCommand } from "./domain/work-item-validation";
import {
  parseExpectedWorkItemUpdatedAt,
  WORK_ITEM_REVISION_CONFLICT_MESSAGE,
  workItemRevisionMatches,
} from "./domain/work-item-revision";
import { validateWorkItemRelations } from "./domain/work-item-relation-validation";
import { effectiveWorkItemRelationInput } from "./domain/work-item-relation-state";
import {
  approvalControlTarget,
  approvalEntityType,
  approvalSummary,
  approvalTitle,
  businessActionKeyFor,
  getWorkTaskApprovalResourceKey,
  hasPlanSourceReference,
  normalizeApprovalWorkspaceTargetType,
  normalizePlanApprovalData,
  nullablePositiveNumber,
  resolveTargetFromScope,
  workApprovalRequestHref,
  workOkrWorkflowBusinessActionKey,
  WORK_TASK_APPROVAL_SUBJECT,
  type WorkTaskApprovalPayload,
  type WorkTaskCollaborationApprovalPayload,
  type WorkTaskKrReviewApprovalPayload, type WorkTaskItemApprovalPayload, type WorkTaskObjectivePlanApprovalPayload,
  type WorkTaskPlanApprovalPayload, type WorkTaskReportApprovalPayload, type WorkTaskRevisionApprovalPayload,
} from "./task-approval-helpers";
import { validateCollaborationApprovalPayload } from "./task-approval-collaborations";
import {
  validateKrReviewApprovalPayload,
  validateObjectivePlanApprovalPayload,
} from "./task-approval-okr";
import { workTaskScopeId } from "./task-spaces";
import { validateWorkCollaborationReference } from "./work-collaboration-references";
import { validateWorkSourceDepartmentSelection } from "./work-source-departments";
import { canProcessWorkTaskRequest, resolveWorkTaskHandlerUserIds } from "./task-approval-handlers";
import { normalizeApprovalPayload } from "./task-approval-normalize";
import { resolveWorkReportWorkflowActionKind, validateReportApprovalPayload } from "./task-approval-reports";
import { validateWorkItemPeriodRelations, validateWorkPlanPeriodRelations } from "./work-period-relations";
import { isWorkPeriodScheduleApprovalPayload, validateWorkPeriodScheduleApprovalPayload } from "./work-period-schedule-approval";
import { normalizeApprovalParticipants, validateReferencedProjectVisibility } from "./task-approval-reference-validation";
import { getWorkPlanOkrGovernance, workPlanGovernanceSelect, workPlanPreparedWorkflowBinding } from "./work-plan-governance";
import { workOkrFacetMutationIssue } from "./domain/work-okr-governance-policy";
import { commitPreparedWorkTaskPayload } from "./task-approval-commit";
export { commitPreparedWorkTaskPayload } from "./task-approval-commit";

export {
  getWorkTaskApprovalResourceKey,
  mergeWorkTaskSubmissionPayload,
  normalizeApprovalTargetType,
  normalizeApprovalWorkspaceTargetType,
} from "./task-approval-helpers";
export type {
  WorkTaskApprovalEntityType,
  WorkTaskApprovalPayload,
  WorkTaskApprovalTargetType,
} from "./task-approval-helpers";
export { WORK_TASK_APPROVAL_SUBJECT } from "./task-approval-helpers";

export const workTaskApprovalAdapter: ApprovalAdapter<WorkTaskApprovalPayload> = {
  subjectType: WORK_TASK_APPROVAL_SUBJECT,
  workflowDefaults: ({ operation, prepared, request }) => ({
    businessActionKey: businessActionKeyFor(operation, prepared?.payload ?? request?.latestPayload ?? null),
    scopeType: approvalControlTarget(prepared?.payload ?? request?.latestPayload ?? null)?.targetType ?? null,
    mode: "optional",
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    handlerSource: "permission",
  }),
  validatePayload: async ({ actorUserId, operation, subjectId, payload }) => validateWorkTaskApprovalPayload({
    actorUserId,
    operation,
    subjectId,
    payload,
  }),
  resolveAccess: async ({ actorUserId, action, prepared, request }) => {
    const payload = prepared?.payload ?? request?.latestPayload ?? null;
    const scopeTarget = await resolveTargetFromScope(request?.scopeId);
    const workspaceTarget = payload ?? scopeTarget;
    const controlTarget = approvalControlTarget(payload) ?? scopeTarget;
    if (!workspaceTarget && !controlTarget) return false;
    if (action === "listRequests") return Boolean(controlTarget && await canViewWorkTaskTarget(actorUserId, controlTarget.targetType, controlTarget.targetId));
    if (action === "createDraft") return Boolean(workspaceTarget && await canSubmitWorkTaskAction(actorUserId, workspaceTarget.targetType, workspaceTarget.targetId));
    if (action === "reviewUpdate" || action === "approve" || action === "reject") {
      return Boolean(request && await canProcessWorkTaskRequest(actorUserId, request));
    }
    if (action === "comment") {
      return Boolean(request && (
        request.submitterUserId === actorUserId ||
        await canProcessWorkTaskRequest(actorUserId, request)
      ));
    }
    return false;
  },
  resolveHandlers: async ({ handlerSource, request }) =>
    resolveWorkTaskHandlerUserIds(handlerSource, request),
  resolveRecipients: async ({ eventType, actorUserId, request }) => {
    if (eventType === "submit") return resolveWorkTaskHandlerUserIds(request.handlerSource, request, actorUserId);
    if (eventType === "approve" || eventType === "reject") return [request.submitterUserId];
    if (eventType === "comment") {
      if (actorUserId === request.submitterUserId) return resolveWorkTaskHandlerUserIds(request.handlerSource, request, actorUserId);
      return [request.submitterUserId];
    }
    return [];
  },
  describeRequest: ({ request }) => {
    const entityType = approvalEntityType(request.latestPayload);
    const content = approvalSummary(request.latestPayload);
    return {
      title: approvalTitle(request.operation, entityType, request.latestPayload),
      summary: content || `审批单 #${request.id}`,
      href: workApprovalRequestHref(request.latestPayload, request.id),
    };
  },
  commitApprovedPayload: async ({ actorUserId, request, approvalAuthorization }) => {
    const payload = request.latestPayload;
    const zeroNodeSelfCommit = request.workflowNodes.length === 0 && request.submitterUserId === actorUserId;
    if (!zeroNodeSelfCommit && !(await canProcessWorkTaskRequest(actorUserId, request))) return serviceError("无权限审批该工作项", 403);
    return commitPreparedWorkTaskPayload({
      actorUserId,
      submitterUserId: request.submitterUserId,
      operation: request.operation,
      subjectId: request.subjectId,
      payload,
      authorization: "workflow-approved",
      approvalAuthorization,
      approvalRequest: request,
    });
  },
};

export function commitWorkItemApproval(
  actorUserId: number,
  submitterUserId: number,
  operation: ApprovalOperation,
  payload: WorkTaskItemApprovalPayload,
): Promise<ServiceResult<{ entityType: string; entityId: string; entity: unknown }>> {
  return commitPreparedWorkTaskPayload({
    actorUserId,
    submitterUserId,
    operation,
    payload,
    authorization: "direct",
  }).then((result) => (
    result.ok
      ? serviceOk(result.data as { entityType: string; entityId: string; entity: unknown })
      : result
  ));
}

export function commitRevisionApproval(input: {
  actorUserId: number;
  submitterUserId: number;
  payload: WorkTaskRevisionApprovalPayload;
}) {
  return commitPreparedWorkTaskPayload({
    ...input,
    operation: "update",
    authorization: "direct",
  });
}

async function validateWorkTaskApprovalPayload(input: {
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: unknown;
}) {
  const raw = normalizeApprovalPayload(input.payload);
  if (!raw.ok) return raw;
  const entityType = approvalEntityType(raw.data);
  if (entityType === "item") {
    if (input.operation === "create") return validateCreateItemApprovalPayload(input.actorUserId, raw.data as WorkTaskItemApprovalPayload);
    return validateUpdateItemApprovalPayload(input.actorUserId, input.subjectId, raw.data as WorkTaskItemApprovalPayload);
  }
  if (entityType === "plan") {
    if (input.operation === "create") return validateCreatePlanApprovalPayload(input.actorUserId, raw.data as WorkTaskPlanApprovalPayload);
    return validateUpdatePlanApprovalPayload(input.actorUserId, input.subjectId, raw.data as WorkTaskPlanApprovalPayload);
  }
  if (entityType === "collaboration") return validateCollaborationApprovalPayload({ operation: input.operation, subjectId: input.subjectId, payload: raw.data as WorkTaskCollaborationApprovalPayload });
  if (entityType === "objective_plan") return validateObjectivePlanApprovalPayload(raw.data as WorkTaskObjectivePlanApprovalPayload, input.subjectId, input.actorUserId);
  if (entityType === "kr_review") return validateKrReviewApprovalPayload(raw.data as WorkTaskKrReviewApprovalPayload, input.subjectId, input.actorUserId);
  if (entityType === "revision") return validateRevisionApprovalPayload(input.actorUserId, raw.data as WorkTaskRevisionApprovalPayload);
  return validateReportApprovalPayload(raw.data as WorkTaskReportApprovalPayload);
}

export async function validateCreateItemApprovalPayload(actorUserId: number, payload: WorkTaskItemApprovalPayload) {
  if (isWorkPeriodScheduleApprovalPayload(payload)) {
    return validateWorkPeriodScheduleApprovalPayload(payload);
  }
  const createInput = {
    targetType: payload.targetType,
    targetId: payload.targetId,
    ...payload.data,
    participants: normalizeApprovalParticipants(payload.data.participants),
  } as Parameters<typeof buildWorkItemCreateCommand>[0];
  const command = buildWorkItemCreateCommand(createInput);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const relationError = await validateWorkItemRelations({ ...command.data, actorUserId });
  if (relationError) return serviceError(relationError, 400);
  const periodRelationError = await validateWorkItemPeriodRelations({ ...command.data, actorUserId });
  if (periodRelationError) return serviceError(periodRelationError, 400);
  const visibilityError = await validateReferencedProjectVisibility(actorUserId, command.data);
  if (visibilityError) return serviceError(visibilityError, 403);
  return serviceOk({
    resourceKey: getWorkTaskApprovalResourceKey(payload.targetType),
    scopeId: workTaskScopeId(payload.targetType, payload.targetId),
    subjectId: null,
    businessActionKey: "work.tasks.item.create",
    workflowScopeType: payload.targetType,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      entityType: "item" as const,
      targetType: payload.targetType,
      targetId: payload.targetId,
      workId: null,
      data: command.data as unknown as Record<string, unknown>,
    },
  });
}

export async function validateUpdateItemApprovalPayload(
  actorUserId: number,
  subjectId: string | null | undefined,
  payload: WorkTaskItemApprovalPayload,
) {
  const workId = payload.workId ?? Number(subjectId);
  if (!Number.isInteger(workId) || workId <= 0) return serviceError("工作项 ID 无效", 400);
  const existing = await prisma.workItem.findUnique({
    where: { id: workId },
    select: {
      targetType: true,
      targetId: true,
      planId: true,
      category: true,
      itemType: true,
      routineTaskType: true,
      actualStartDate: true,
      actualEndDate: true,
      sourceType: true,
      sourceKind: true,
      sourceMeetingId: true,
      sourceMeetingDecisionId: true,
      sourceMeetingActionCandidateId: true,
      sourceDepartmentId: true,
      linkedProjectId: true,
      linkedProjectPhaseId: true,
      parentWorkItemId: true,
      parentPeriodWorkItemId: true,
      previousPeriodWorkItemId: true,
      collaborationId: true, status: true,
      updatedAt: true,
    },
  });
  if (!existing?.targetId) return serviceError("工作项不存在", 404);
  const expectedUpdatedAt = payload.expectedUpdatedAt === undefined
    ? undefined
    : parseExpectedWorkItemUpdatedAt(payload.expectedUpdatedAt);
  if (payload.expectedUpdatedAt !== undefined && !expectedUpdatedAt) {
    return serviceError("工作项版本无效", 400);
  }
  if (expectedUpdatedAt && !workItemRevisionMatches(existing.updatedAt, expectedUpdatedAt)) {
    return serviceError(WORK_ITEM_REVISION_CONFLICT_MESSAGE, 409);
  }
  const targetType = normalizeApprovalWorkspaceTargetType(existing.targetType);
  if (!targetType) return serviceError("工作空间范围无效", 400);
  const command = buildWorkItemUpdateCommand(workId, {
    ...payload.data,
    participants: payload.data.participants === undefined ? undefined : normalizeApprovalParticipants(payload.data.participants),
  }, existing);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const effective = effectiveWorkItemRelationInput(existing, command.data.data);
  const relationError = await validateWorkItemRelations({
    targetType: existing.targetType,
    targetId: existing.targetId,
    currentWorkId: command.data.workId, status: command.data.data.status === undefined ? existing.status : command.data.data.status,
    ownerEmployeeId: command.data.data.ownerEmployeeId,
    collaborationId: command.data.data.collaborationId === undefined ? existing.collaborationId : command.data.data.collaborationId,
    actorUserId,
    ...effective,
  });
  if (relationError) return serviceError(relationError, 400);
  const periodRelationError = await validateWorkItemPeriodRelations({
    targetType: existing.targetType,
    targetId: existing.targetId,
    currentWorkId: command.data.workId,
    planId: effective.planId,
    category: command.data.data.category ?? existing.category,
    itemType: effective.itemType,
    parentWorkItemId: effective.parentWorkItemId,
    parentPeriodWorkItemId: command.data.data.parentPeriodWorkItemId === undefined ? existing.parentPeriodWorkItemId : command.data.data.parentPeriodWorkItemId,
    previousPeriodWorkItemId: command.data.data.previousPeriodWorkItemId === undefined ? existing.previousPeriodWorkItemId : command.data.data.previousPeriodWorkItemId,
  });
  if (periodRelationError) return serviceError(periodRelationError, 400);
  const visibilityError = await validateReferencedProjectVisibility(actorUserId, command.data.data);
  if (visibilityError) return serviceError(visibilityError, 403);
  const sourceDepartmentError = await validateWorkSourceDepartmentSelection({
    userId: actorUserId,
    sourceType: command.data.data.sourceType ?? existing.sourceType,
    sourceDepartmentId: command.data.data.sourceDepartmentId === undefined ? existing.sourceDepartmentId : command.data.data.sourceDepartmentId,
  });
  if (sourceDepartmentError) return serviceError(sourceDepartmentError, 400);
  return serviceOk({
    resourceKey: getWorkTaskApprovalResourceKey(targetType),
    scopeId: workTaskScopeId(targetType, existing.targetId),
    subjectId: String(workId),
    businessActionKey: "work.tasks.item.update",
    workflowScopeType: targetType,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      entityType: "item" as const,
      targetType,
      targetId: existing.targetId,
      workId,
      ...(expectedUpdatedAt && { expectedUpdatedAt: expectedUpdatedAt.toISOString() }),
      data: command.data.data as Record<string, unknown>,
    },
  });
}

async function validateCreatePlanApprovalPayload(actorUserId: number, payload: WorkTaskPlanApprovalPayload) {
  if (hasPlanSourceReference(payload.data)) return serviceError("工作计划不再选择部门、项目或会议来源；请在个人工作项上引用来源", 400);
  const data = normalizePlanApprovalData(payload.data);
  if (!String(data.title ?? "").trim()) return serviceError("OKR 计划名称不能为空", 400);
  const collaborationError = await validateWorkCollaborationReference({ actorUserId, collaborationId: nullablePositiveNumber(data.collaborationId), targetType: payload.targetType, targetId: payload.targetId });
  if (collaborationError) return serviceError(collaborationError, 400);
  const periodRelationError = await validateWorkPlanPeriodRelations(planPeriodRelationInput(data, {
    targetType: payload.targetType,
    targetId: payload.targetId,
    kind: "okr",
  }));
  if (periodRelationError) return serviceError(periodRelationError, 400);
  return serviceOk({
    resourceKey: getWorkTaskApprovalResourceKey(payload.targetType),
    scopeId: workTaskScopeId(payload.targetType, payload.targetId),
    subjectId: null,
    businessActionKey: workOkrWorkflowBusinessActionKey({ kind: "objective_revise", workspaceTargetType: payload.targetType }),
    workflowScopeType: payload.targetType,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: { ...payload, planId: null, data },
  });
}

async function validateUpdatePlanApprovalPayload(
  actorUserId: number,
  subjectId: string | null | undefined,
  payload: WorkTaskPlanApprovalPayload,
) {
  const planId = payload.planId ?? Number(subjectId);
  if (!Number.isInteger(planId) || planId <= 0) return serviceError("OKR 计划 ID 无效", 400);
  const existing = await prisma.workPlan.findUnique({
    where: { id: planId },
    select: { ...workPlanGovernanceSelect, parentPeriodPlanId: true, previousPeriodPlanId: true, sourceType: true, sourceDepartmentId: true, collaborationId: true },
  });
  if (!existing?.targetId) return serviceError("OKR 计划不存在", 404);
  const targetType = normalizeApprovalWorkspaceTargetType(existing.targetType);
  if (!targetType) return serviceError("审批工作空间无效", 400);
  if (hasPlanSourceReference(payload.data)) return serviceError("工作计划不再选择部门、项目或会议来源；请在个人工作项上引用来源", 400);
  const data = normalizePlanApprovalData(payload.data);
  if (data.title !== undefined && !String(data.title).trim()) return serviceError("OKR 计划名称不能为空", 400);
  const collaborationError = await validateWorkCollaborationReference({
    actorUserId,
    collaborationId: data.collaborationId === undefined ? existing.collaborationId : nullablePositiveNumber(data.collaborationId),
    targetType,
    targetId: existing.targetId,
  });
  if (collaborationError) return serviceError(collaborationError, 400);
  const periodRelationError = await validateWorkPlanPeriodRelations(planPeriodRelationInput(data, { ...existing, currentPlanId: planId }));
  if (periodRelationError) return serviceError(periodRelationError, 400);
  const governance = await getWorkPlanOkrGovernance({ planId, actorUserId });
  if (!governance) return serviceError("工作计划治理状态不存在", 409);
  const targetFacet = governance.governance.facets.target;
  const targetIssue = workOkrFacetMutationIssue(targetFacet, "目标修订");
  if (targetIssue) return serviceError(targetIssue.message, targetIssue.status);
  const actionKind = targetFacet.action?.kind ?? "objective_revise";
  const workflowBinding = await workPlanPreparedWorkflowBinding(existing, actionKind);
  return serviceOk({
    resourceKey: getWorkTaskApprovalResourceKey(targetType),
    scopeId: workTaskScopeId(targetType, existing.targetId),
    subjectId: String(planId),
    ...workflowBinding,
    workflowScopeType: targetType,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      entityType: "plan" as const,
      targetType,
      targetId: existing.targetId,
      planId,
      data,
    },
  });
}

export async function validateRevisionApprovalPayload(actorUserId: number, payload: WorkTaskRevisionApprovalPayload) {
  if (payload.changeTarget === "work_report") {
    const targetType = normalizeApprovalWorkspaceTargetType(payload.targetType);
    if (!targetType) return serviceError("目标/考核表修订工作空间无效", 400);
    const reportPayload: WorkTaskReportApprovalPayload = {
      entityType: "report",
      targetType,
      targetId: payload.targetId,
      reportId: payload.reportId,
      periodType: payload.periodType,
      periodStart: payload.periodStart ?? null,
      reportStage: payload.reportStage,
      data: payload.data,
    };
    const actionKind = resolveWorkReportWorkflowActionKind(
      payload.reportStage ?? payload.data.reportStage,
      "correct",
    );
    const prepared = await validateReportApprovalPayload(reportPayload, { actionKind });
    if (!prepared.ok) return prepared;
    return serviceOk({
      ...prepared.data,
      subjectId: `revision:report:${targetType}:${payload.targetId}:${payload.periodType || payload.data.periodType}:${payload.periodStart || payload.data.periodStart}:${payload.reportStage || payload.data.reportStage || "final"}`,
      payload: {
        ...payload,
        targetType,
        controlScopeType: prepared.data.payload.controlScopeType,
        controlScopeId: prepared.data.payload.controlScopeId,
        periodType: reportPayload.periodType ?? String(prepared.data.payload.data.periodType || "weekly"),
        periodStart: reportPayload.periodStart ?? String(prepared.data.payload.data.periodStart || ""),
        reportStage: reportPayload.reportStage ?? (prepared.data.payload.data.reportStage === "kr" ? "kr" : "final"),
        data: {
          ...prepared.data.payload.data,
          changeTarget: "work_report",
        },
      },
    });
  }
  const planId = payload.planId;
  if (!planId || !Number.isInteger(planId) || planId <= 0) return serviceError("工作计划 ID 无效", 400);
  const existing = await prisma.workPlan.findUnique({
    where: { id: planId },
    select: { ...workPlanGovernanceSelect, parentPeriodPlanId: true, previousPeriodPlanId: true, sourceType: true, sourceDepartmentId: true, collaborationId: true },
  });
  if (!existing?.targetId) return serviceError("工作计划不存在", 404);
  const targetType = normalizeApprovalWorkspaceTargetType(existing.targetType);
  if (!targetType) return serviceError("修订审批工作空间无效", 400);
  if (hasPlanSourceReference(payload.data)) return serviceError("工作计划不再选择部门、项目或会议来源；请在个人工作项上引用来源", 400);
  const data = normalizePlanApprovalData(payload.data);
  if (data.title !== undefined && !String(data.title).trim()) return serviceError("工作计划名称不能为空", 400);
  const collaborationError = await validateWorkCollaborationReference({
    actorUserId,
    collaborationId: data.collaborationId === undefined ? existing.collaborationId : nullablePositiveNumber(data.collaborationId),
    targetType,
    targetId: existing.targetId,
  });
  if (collaborationError) return serviceError(collaborationError, 400);
  const periodRelationError = await validateWorkPlanPeriodRelations(planPeriodRelationInput(data, { ...existing, currentPlanId: planId }));
  if (periodRelationError) return serviceError(periodRelationError, 400);
  const workflowBinding = await workPlanPreparedWorkflowBinding(existing, "objective_revise");
  return serviceOk({
    resourceKey: getWorkTaskApprovalResourceKey(targetType),
    scopeId: workTaskScopeId(targetType, existing.targetId),
    subjectId: `revision:plan:${planId}`,
    ...workflowBinding,
    workflowScopeType: targetType,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      entityType: "revision" as const,
      changeTarget: "okr_plan" as const,
      targetType,
      targetId: existing.targetId,
      planId,
      reportId: null,
      data: {
        ...data,
        changeTarget: "okr_plan",
      },
    },
  });
}

function planPeriodRelationInput(
  data: Record<string, unknown>,
  fallback: {
    currentPlanId?: number | null;
    targetType?: string | null;
    targetId?: number | null;
    kind?: string | null;
    okrCycleId?: number | null;
    parentPeriodPlanId?: number | null;
    previousPeriodPlanId?: number | null;
  },
) {
  return {
    currentPlanId: fallback.currentPlanId ?? null,
    targetType: fallback.targetType ?? null,
    targetId: fallback.targetId ?? null,
    kind: typeof data.kind === "string" ? data.kind : fallback.kind ?? "okr",
    okrCycleId: data.okrCycleId === undefined ? fallback.okrCycleId ?? null : nullablePositiveNumber(data.okrCycleId),
    parentPeriodPlanId: data.parentPeriodPlanId === undefined ? fallback.parentPeriodPlanId ?? null : nullablePositiveNumber(data.parentPeriodPlanId),
    previousPeriodPlanId: data.previousPeriodPlanId === undefined ? fallback.previousPeriodPlanId ?? null : nullablePositiveNumber(data.previousPeriodPlanId),
  };
}
