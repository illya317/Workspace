import {
  assertBusinessActionDirectExecutionAllowed,
  resolveBusinessActionRuntime,
} from "@workspace/platform/server/business-action-executor";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  getEffectiveWorkTaskActionPermissions,
  getWorkTaskPermissionResourceKey,
  type WorkSpaceTargetType,
} from "./access";
import {
  workOkrWorkflowBusinessActionKey,
} from "./task-approval-helpers";
import { workTaskScopeId } from "./task-spaces";
import { resolveWorkOkrControlScopeForPlan } from "./work-okr-control";
import {
  resolveWorkPlanActionRuntime,
  workPlanGovernanceSelect,
  type WorkPlanGovernanceRow,
} from "./work-plan-governance";
import { prisma } from "@workspace/platform/server/prisma";

type WorkReportStage = "kr" | "final";

export function workReportBusinessActionKey(
  targetType: WorkSpaceTargetType,
  reportStage: string | null | undefined,
  periodType?: string | null,
) {
  if (!workReportWorkflowApplicable(periodType)) return "work.tasks.report.save";
  return workOkrWorkflowBusinessActionKey({
    kind: reportStage === "kr" ? "objective_submit" : "report_submit",
    workspaceTargetType: targetType,
  });
}

export function workReportWorkflowApplicable(periodType: string | null | undefined) {
  return periodType !== "weekly" && periodType !== "monthly";
}

export async function resolveWorkReportActionRuntime(input: {
  actorUserId: number;
  targetType: WorkSpaceTargetType;
  targetId: number;
  periodType: string | null | undefined;
  periodStart?: string | Date | null;
  reportStage: WorkReportStage;
}) {
  const businessActionKey = workReportBusinessActionKey(input.targetType, input.reportStage, input.periodType);
  const permissions = await getEffectiveWorkTaskActionPermissions(
    input.actorUserId,
    input.targetType,
    input.targetId,
  );
  if (!workReportWorkflowApplicable(input.periodType)) {
    return serviceOk(await resolveBusinessActionRuntime({
      businessActionKey,
      actor: {
        userId: input.actorUserId,
        canDirectWrite: permissions.canUpdate,
        canStartWorkflow: permissions.canSubmit,
        canProcessWorkflow: permissions.canApprove,
      },
      workflowApplicable: false,
    }));
  }
  const boundPlan = await findWorkReportGovernancePlan(input);
  if (boundPlan) {
    return serviceOk(await resolveWorkPlanActionRuntime({
      plan: boundPlan,
      kind: input.reportStage === "kr" ? "objective_submit" : "report_submit",
      actor: {
        userId: input.actorUserId,
        canDirectWrite: permissions.canUpdate,
        canStartWorkflow: permissions.canSubmit,
        canProcessWorkflow: permissions.canApprove,
      },
    }));
  }
  const context = await resolveWorkReportWorkflowContext(input.targetType, input.targetId);
  if (!context.ok) return context;
  return serviceOk(await resolveBusinessActionRuntime({
    businessActionKey,
    actor: {
      userId: input.actorUserId,
      canDirectWrite: permissions.canUpdate,
      canStartWorkflow: permissions.canSubmit,
      canProcessWorkflow: permissions.canApprove,
    },
    resourceKey: context.data.resourceKey,
    scopeType: context.data.scopeType,
    scopeId: context.data.scopeId,
    defaults: workflowDefaults(businessActionKey),
  }));
}

export async function assertWorkReportDirectCommitAllowed(input: {
  actorUserId: number;
  targetType: WorkSpaceTargetType;
  targetId: number;
  periodType: string | null | undefined;
  periodStart?: string | Date | null;
  reportStage: WorkReportStage;
}) {
  if (!workReportWorkflowApplicable(input.periodType)) {
    return serviceOk({ allowed: true as const });
  }
  const boundPlan = await findWorkReportGovernancePlan(input);
  if (boundPlan) {
    const runtime = await resolveWorkPlanActionRuntime({
      plan: boundPlan,
      kind: input.reportStage === "kr" ? "objective_submit" : "report_submit",
      actor: { userId: input.actorUserId, canDirectWrite: true },
    });
    if (runtime.executionMode === "direct" && runtime.capabilities.record.save.allowed) {
      return serviceOk({ allowed: true as const });
    }
    return serviceError(
      runtime.availability === "unavailable" ? "当前计划的提交流程已关闭" : "当前计划需要提交审批，不能直接保存",
      409,
    );
  }
  const context = await resolveWorkReportWorkflowContext(input.targetType, input.targetId);
  if (!context.ok) return context;
  const businessActionKey = workReportBusinessActionKey(input.targetType, input.reportStage, input.periodType);
  return assertBusinessActionDirectExecutionAllowed({
    businessActionKey,
    actorUserId: input.actorUserId,
    resourceKey: context.data.resourceKey,
    scopeType: context.data.scopeType,
    scopeId: context.data.scopeId,
    defaults: workflowDefaults(businessActionKey),
  });
}

export async function findWorkReportGovernancePlan(input: {
  targetType: WorkSpaceTargetType;
  targetId: number;
  periodType: string | null | undefined;
  periodStart?: string | Date | null;
}) {
  const periodStart = normalizePeriodStart(input.periodStart);
  if (!periodStart) return null;
  return prisma.workPlan.findFirst({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      kind: "okr",
      isArchived: false,
      ...(input.periodType ? { periodType: input.periodType } : {}),
      plannedStartDate: { lte: periodStart },
      plannedEndDate: { gte: periodStart },
    },
    select: workPlanGovernanceSelect,
    orderBy: [{ isSystemGenerated: "desc" }, { id: "asc" }],
  }) as Promise<WorkPlanGovernanceRow | null>;
}

function normalizePeriodStart(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function resolveWorkReportWorkflowContext(targetType: WorkSpaceTargetType, targetId: number) {
  const scope = await resolveWorkOkrControlScopeForPlan(
    { targetType, targetId },
    { requirePersonalDepartment: true },
  );
  if (!scope.ok) return scope;
  if (!scope.data.targetType || !scope.data.targetId) {
    return serviceError("目标/考核表审批管控空间无效", 400);
  }
  return serviceOk({
    resourceKey: getWorkTaskPermissionResourceKey(scope.data.targetType),
    scopeType: scope.data.targetType,
    scopeId: workTaskScopeId(scope.data.targetType, scope.data.targetId),
  });
}

function workflowDefaults(businessActionKey: string) {
  return {
    businessActionKey,
    mode: "optional" as const,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    handlerSource: "permission" as const,
  };
}
