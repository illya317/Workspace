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
  reportStage: WorkReportStage;
}) {
  if (!workReportWorkflowApplicable(input.periodType)) {
    return serviceOk({ allowed: true as const });
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
