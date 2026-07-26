import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { parseExpectedWorkItemUpdatedAt } from "./domain/work-item-revision";
import {
  approvalEntityType,
  normalizeApprovalTargetType,
  normalizeApprovalWorkspaceTargetType,
  nullablePositiveNumber,
  nullableString,
  type WorkTaskApprovalPayload,
  type WorkTaskCollaborationApprovalPayload,
  type WorkTaskItemApprovalPayload,
  type WorkTaskKrReviewApprovalPayload,
  type WorkTaskObjectivePlanApprovalPayload,
  type WorkTaskPlanApprovalPayload,
  type WorkTaskReportApprovalPayload,
  type WorkTaskRevisionApprovalPayload,
} from "./task-approval-helpers";

export function normalizeApprovalPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return serviceError("审批草稿无效", 400);
  const input = payload as Partial<WorkTaskApprovalPayload> & {
    entityId?: unknown;
    workId?: unknown;
    planId?: unknown;
    reportId?: unknown;
    periodType?: unknown;
    periodStart?: unknown;
    reportStage?: unknown;
    expectedUpdatedAt?: unknown;
  };
  const entityType = approvalEntityType(input);
  const workspaceTargetType = normalizeApprovalWorkspaceTargetType(input.targetType);
  const targetType = normalizeApprovalTargetType(input.targetType);
  const controlScopeType = normalizeApprovalTargetType(input.controlScopeType);
  const controlScopeId = nullablePositiveNumber(input.controlScopeId);
  const targetId = normalizePositiveId(input.targetId);
  if (!targetId) return serviceError("工作空间无效", 400);
  const data = input.data && typeof input.data === "object" ? input.data as Record<string, unknown> : {};
  if (entityType === "collaboration") {
    if (workspaceTargetType !== "department") return serviceError("部门协作只能从部门空间提交", 400);
    return serviceOk({ entityType, targetType: "department", targetId, data } satisfies WorkTaskCollaborationApprovalPayload);
  }
  if (entityType === "objective_plan") {
    if (!workspaceTargetType) return serviceError("审批工作空间无效", 400);
    return serviceOk({ entityType, targetType: workspaceTargetType, targetId, controlScopeType, controlScopeId, planId: nullablePositiveNumber(input.planId ?? input.entityId) ?? 0, data } satisfies WorkTaskObjectivePlanApprovalPayload);
  }
  if (entityType === "kr_review") {
    if (!workspaceTargetType) return serviceError("审批工作空间无效", 400);
    return serviceOk({ entityType, targetType: workspaceTargetType, targetId, controlScopeType, controlScopeId, planId: nullablePositiveNumber(input.planId ?? input.entityId) ?? 0, data } satisfies WorkTaskKrReviewApprovalPayload);
  }
  if (entityType === "plan") {
    if (!workspaceTargetType) return serviceError("审批工作空间无效", 400);
    return serviceOk({ entityType, targetType: workspaceTargetType, targetId, planId: nullablePositiveNumber(input.planId ?? input.entityId), data } satisfies WorkTaskPlanApprovalPayload);
  }
  if (entityType === "report") {
    if (!workspaceTargetType) return serviceError("审批工作空间无效", 400);
    return serviceOk({
      entityType,
      targetType: workspaceTargetType,
      targetId,
      controlScopeType,
      controlScopeId,
      reportId: nullablePositiveNumber(input.reportId ?? input.entityId),
      periodType: nullableString(input.periodType ?? data.periodType),
      periodStart: nullableString(input.periodStart ?? data.periodStart),
      reportStage: normalizeReportStage(input.reportStage ?? data.reportStage),
      data,
    } satisfies WorkTaskReportApprovalPayload);
  }
  if (entityType === "revision") {
    if (!workspaceTargetType) return serviceError("审批工作空间无效", 400);
    const changeTarget = data.changeTarget === "work_report" ? "work_report" : "okr_plan";
    return serviceOk({
      entityType,
      changeTarget,
      targetType: workspaceTargetType,
      targetId,
      controlScopeType,
      controlScopeId,
      planId: nullablePositiveNumber(input.planId ?? input.entityId),
      reportId: nullablePositiveNumber(input.reportId ?? input.entityId),
      periodType: nullableString(input.periodType ?? data.periodType),
      periodStart: nullableString(input.periodStart ?? data.periodStart),
      reportStage: normalizeReportStage(input.reportStage ?? data.reportStage),
      data,
    } satisfies WorkTaskRevisionApprovalPayload);
  }
  if (!targetType) return serviceError("审批只支持组织工作空间", 400);
  const expectedUpdatedAt = input.expectedUpdatedAt === undefined
    ? undefined
    : parseExpectedWorkItemUpdatedAt(input.expectedUpdatedAt);
  if (input.expectedUpdatedAt !== undefined && !expectedUpdatedAt) {
    return serviceError("工作项版本无效", 400);
  }
  return serviceOk({
    entityType: "item",
    targetType,
    targetId,
    workId: nullablePositiveNumber(input.workId ?? input.entityId),
    data,
    ...(expectedUpdatedAt && { expectedUpdatedAt: expectedUpdatedAt.toISOString() }),
  } satisfies WorkTaskItemApprovalPayload);
}

function normalizeReportStage(value: unknown): "kr" | "final" {
  return value === "kr" ? "kr" : "final";
}

function normalizePositiveId(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
