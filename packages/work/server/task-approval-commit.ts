import type { ApprovalOperation } from "@workspace/platform/server/approvals";
import {
  consumeApprovalCommitAuthorization,
  type ApprovalCommitAuthorization,
} from "@workspace/platform/server/approval-commit-authorization";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { commitCollaborationApproval } from "./task-approval-collaborations";
import {
  approvalEntityType,
  businessActionKeyFor,
  normalizeApprovalWorkspaceTargetType,
  type WorkTaskApprovalPayload,
  type WorkTaskCollaborationApprovalPayload,
  type WorkTaskItemApprovalPayload,
  type WorkTaskKrReviewApprovalPayload,
  type WorkTaskObjectivePlanApprovalPayload,
  type WorkTaskPlanApprovalPayload,
  type WorkTaskReportApprovalPayload,
  type WorkTaskRevisionApprovalPayload,
} from "./task-approval-helpers";
import { commitKrReviewApproval, commitObjectivePlanApproval } from "./task-approval-okr";
import { commitWorkReportApproval } from "./task-approval-reports";
import {
  commitWorkPeriodScheduleApproval,
  isWorkPeriodScheduleApprovalPayload,
} from "./work-period-schedule-approval";
import { createWorkPlan, updateWorkPlan } from "./work-plans";
import { createWorkItem, updateWorkItem } from "./works";

type WorkTaskCommitInput = {
  actorUserId: number;
  submitterUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: WorkTaskApprovalPayload;
} & (
  | { authorization: "direct"; approvalAuthorization?: never; approvalRequest?: never }
  | {
      authorization: "workflow-approved";
      approvalAuthorization: ApprovalCommitAuthorization;
      approvalRequest: { id: number; version: number; businessActionKey: string };
    }
);

export async function commitPreparedWorkTaskPayload(input: WorkTaskCommitInput) {
  const entityType = approvalEntityType(input.payload);
  const authorization = input.authorization;
  if (authorization === "workflow-approved") {
    const businessActionKey = businessActionKeyFor(input.operation, input.payload);
    if (input.approvalRequest.businessActionKey !== businessActionKey) {
      return serviceError("批准后的工作写入与审批行为不匹配", 500);
    }
    const authorized = consumeApprovalCommitAuthorization({
      authorization: input.approvalAuthorization,
      requestId: input.approvalRequest.id,
      requestVersion: input.approvalRequest.version,
      businessActionKey,
    });
    if (!authorized.ok) return authorized;
  }
  const result = entityType === "objective_plan"
    ? await commitObjectivePlanApproval(input.actorUserId, input.submitterUserId, input.payload as WorkTaskObjectivePlanApprovalPayload, authorization)
    : entityType === "kr_review"
      ? await commitKrReviewApproval(input.actorUserId, input.payload as WorkTaskKrReviewApprovalPayload, authorization)
      : entityType === "item"
        ? await commitWorkItemApproval(input.actorUserId, input.submitterUserId, input.operation, input.payload as WorkTaskItemApprovalPayload, authorization)
        : entityType === "plan"
          ? await commitWorkPlanApproval(input.actorUserId, input.submitterUserId, input.operation, input.payload as WorkTaskPlanApprovalPayload, authorization)
          : entityType === "collaboration"
            ? await commitCollaborationApproval({ submitterUserId: input.submitterUserId, operation: input.operation, subjectId: input.subjectId ?? null, payload: input.payload as WorkTaskCollaborationApprovalPayload })
            : entityType === "revision"
              ? await commitRevisionApproval({ actorUserId: input.actorUserId, submitterUserId: input.submitterUserId, payload: input.payload as WorkTaskRevisionApprovalPayload, authorization })
              : await commitWorkReportApproval({ actorUserId: input.actorUserId, submitterUserId: input.submitterUserId, payload: input.payload as WorkTaskReportApprovalPayload, authorization });
  if (!result.ok) return serviceError(result.error, result.status || 400, result.details);
  return serviceOk(result.data);
}

async function commitWorkItemApproval(
  actorUserId: number,
  submitterUserId: number,
  operation: ApprovalOperation,
  payload: WorkTaskItemApprovalPayload,
  authorization: "direct" | "workflow-approved",
) {
  if (operation === "create" && isWorkPeriodScheduleApprovalPayload(payload)) {
    return commitWorkPeriodScheduleApproval(submitterUserId, payload, authorization);
  }
  const result = operation === "create"
    ? await createWorkItem({
        targetType: payload.targetType,
        targetId: payload.targetId,
        ...payload.data,
        actorUserId,
        ownerEligibilityUserId: submitterUserId,
        mutationAuthorization: authorization,
      } as Parameters<typeof createWorkItem>[0])
    : payload.workId
      ? await updateWorkItem(payload.workId, { ...payload.data, actorUserId, ownerEligibilityUserId: submitterUserId, mutationAuthorization: authorization } as Parameters<typeof updateWorkItem>[1])
      : serviceError("审批单缺少工作项 ID", 400);
  if (!result.ok) return serviceError(result.error, result.status || 400, result.details);
  const entity = result.data as { id?: unknown };
  if (!entity.id) return serviceError("审批通过后未能取得工作项 ID", 500);
  return serviceOk({ entityType: "work.task", entityId: String(entity.id), entity: result.data });
}

async function commitWorkPlanApproval(
  actorUserId: number,
  submitterUserId: number,
  operation: ApprovalOperation,
  payload: WorkTaskPlanApprovalPayload,
  authorization: "direct" | "workflow-approved",
) {
  const result = operation === "create"
    ? await createWorkPlan({
        targetType: payload.targetType,
        targetId: payload.targetId,
        ...payload.data,
        actorUserId,
        ownerEligibilityUserId: submitterUserId,
      } as Parameters<typeof createWorkPlan>[0])
    : payload.planId
      ? await updateWorkPlan(payload.planId, { ...payload.data, actorUserId, ownerEligibilityUserId: submitterUserId, updateGuard: authorization } as Parameters<typeof updateWorkPlan>[1])
      : serviceError("审批单缺少 OKR 计划 ID", 400);
  if (!result.ok) return serviceError(result.error, result.status || 400, result.details);
  const entity = result.data as { id?: unknown };
  if (!entity.id) return serviceError("审批通过后未能取得 OKR 计划 ID", 500);
  return serviceOk({ entityType: "work.plan", entityId: String(entity.id) });
}

async function commitRevisionApproval(input: {
  actorUserId: number;
  submitterUserId: number;
  payload: WorkTaskRevisionApprovalPayload;
  authorization: "direct" | "workflow-approved";
}) {
  if (input.payload.changeTarget === "work_report") {
    const targetType = normalizeApprovalWorkspaceTargetType(input.payload.targetType);
    if (!targetType) return serviceError("目标/考核表修订工作空间无效", 400);
    return commitWorkReportApproval({
      actorUserId: input.actorUserId,
      submitterUserId: input.submitterUserId,
      authorization: input.authorization,
      payload: {
        entityType: "report",
        targetType,
        targetId: input.payload.targetId,
        reportId: input.payload.reportId,
        periodType: input.payload.periodType,
        periodStart: input.payload.periodStart ?? null,
        reportStage: input.payload.reportStage,
        data: input.payload.data,
      },
    });
  }
  if (!input.payload.planId) return serviceError("修订审批缺少工作计划 ID", 400);
  const result = await updateWorkPlan(input.payload.planId, {
    ...input.payload.data,
    actorUserId: input.actorUserId,
    updateGuard: input.authorization,
  } as Parameters<typeof updateWorkPlan>[1]);
  if (!result.ok) return serviceError(result.error, result.status || 400, result.details);
  return serviceOk({ entityType: "work.plan", entityId: String(input.payload.planId) });
}
