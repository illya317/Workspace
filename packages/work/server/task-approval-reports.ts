import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  resolveWorkReportWorkflowActionKind,
  type WorkReportWorkflowActionKind,
} from "./domain/work-report-workflow-action";
export { resolveWorkReportWorkflowActionKind } from "./domain/work-report-workflow-action";
import {
  getWorkTaskApprovalResourceKey,
  nullableString,
  workOkrWorkflowBusinessActionKey,
  type WorkTaskReportApprovalPayload,
} from "./task-approval-helpers";
import { saveWorkReport, type WorkReportItemInput } from "./task-reports";
import { workTaskScopeId } from "./task-spaces";
import { resolveWorkOkrControlScopeForPlan } from "./work-okr-control";
import { findWorkReportGovernancePlan } from "./work-report-action-runtime";
import { workPlanPreparedWorkflowBinding } from "./work-plan-governance";

export async function commitWorkReportApproval(input: {
  actorUserId: number;
  submitterUserId: number;
  payload: WorkTaskReportApprovalPayload;
}) {
  const items = Array.isArray(input.payload.data.items) ? input.payload.data.items as WorkReportItemInput[] : [];
  const result = await saveWorkReport({
    userId: input.submitterUserId,
    actorUserId: input.actorUserId,
    updateGuard: "workflow-approved",
    targetType: input.payload.targetType,
    targetId: input.payload.targetId,
    periodType: nullableString(input.payload.periodType ?? input.payload.data.periodType),
    periodStart: input.payload.periodStart,
    reportStage: nullableString(input.payload.reportStage ?? input.payload.data.reportStage),
    items,
  });
  if (!result.ok) return serviceError(result.error, result.status || 400);
  const report = (result.data as { report?: { id?: unknown } }).report;
  if (!report?.id) return serviceError("审批通过后未能取得目标/考核表 ID", 500);
  return serviceOk({ entityType: "work.report", entityId: String(report.id), entity: result.data });
}

export async function validateReportApprovalPayload(
  payload: WorkTaskReportApprovalPayload,
  options: { actionKind?: WorkReportWorkflowActionKind } = {},
) {
  if (!payload.periodStart) return serviceError("汇报周期无效", 400);
  const approvalTarget = await resolveReportApprovalTarget(payload);
  if (!approvalTarget.ok) return approvalTarget;
  const periodType = normalizeReportPeriodType(payload.periodType ?? payload.data.periodType);
  const reportStage = normalizeReportStage(payload.reportStage ?? payload.data.reportStage);
  const actionKind = options.actionKind ?? resolveWorkReportWorkflowActionKind(reportStage, "submit");
  const items = Array.isArray(payload.data.items) ? payload.data.items : [];
  const boundPlan = await findWorkReportGovernancePlan({
    targetType: payload.targetType,
    targetId: payload.targetId,
    periodType,
    periodStart: payload.periodStart,
  });
  const workflowBinding = boundPlan
    ? await workPlanPreparedWorkflowBinding(boundPlan, actionKind)
    : null;
  return serviceOk({
    resourceKey: getWorkTaskApprovalResourceKey(approvalTarget.data.targetType),
    scopeId: workTaskScopeId(approvalTarget.data.targetType, approvalTarget.data.targetId),
    subjectId: `report:${payload.targetType}:${payload.targetId}:${periodType}:${payload.periodStart}:${reportStage}`,
    businessActionKey: workOkrWorkflowBusinessActionKey({
      kind: actionKind,
      workspaceTargetType: payload.targetType,
    }),
    ...(workflowBinding ?? {}),
    workflowScopeType: approvalTarget.data.targetType,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      entityType: "report" as const,
      targetType: payload.targetType,
      targetId: payload.targetId,
      controlScopeType: approvalTarget.data.targetType,
      controlScopeId: approvalTarget.data.targetId,
      reportId: payload.reportId,
      periodType,
      periodStart: payload.periodStart,
      reportStage,
      data: {
        ...payload.data,
        periodType,
        periodStart: payload.periodStart,
        reportStage,
        items,
      },
    },
  });
}

async function resolveReportApprovalTarget(payload: WorkTaskReportApprovalPayload) {
  const scope = await resolveWorkOkrControlScopeForPlan({
    targetType: payload.targetType,
    targetId: payload.targetId,
  }, { requirePersonalDepartment: true });
  if (!scope.ok) return serviceError(scope.error, scope.status || 400);
  if (!scope.data.targetType || !scope.data.targetId) return serviceError("目标/考核表审批管控空间无效", 400);
  return serviceOk({
    targetType: scope.data.targetType,
    targetId: scope.data.targetId,
  });
}

function normalizeReportPeriodType(value: unknown) {
  return value === "monthly" || value === "quarterly" || value === "half_year" || value === "yearly" ? value : "weekly";
}

function normalizeReportStage(value: unknown): "kr" | "final" {
  return value === "kr" ? "kr" : "final";
}
