import {
  assertBusinessActionDirectExecutionAllowed,
  resolveBusinessActionRuntime,
} from "@workspace/platform/server/business-action-executor";
import { serviceOk } from "@workspace/platform/server/api";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import type { ApprovalOperation } from "@workspace/platform/server/approvals";

const HR_ROSTER_RESOURCE_KEY = "hr.roster";

export type DepartmentMutationAuthorization = "workflow-approved" | "lifecycle";

export async function resolveHrDepartmentActionRuntime(
  actorUserId: number,
  operation: ApprovalOperation,
) {
  const businessActionKey = departmentBusinessActionKey(operation);
  const [canDirectWrite, canStartWorkflow, canProcessWorkflow] = await Promise.all([
    evaluatePermissionAction(actorUserId, HR_ROSTER_RESOURCE_KEY, operation === "create" ? "create" : "update"),
    evaluatePermissionAction(actorUserId, HR_ROSTER_RESOURCE_KEY, "submit"),
    evaluatePermissionAction(actorUserId, HR_ROSTER_RESOURCE_KEY, "approve"),
  ]);
  return resolveBusinessActionRuntime({
    businessActionKey,
    actor: { userId: actorUserId, canDirectWrite, canStartWorkflow, canProcessWorkflow },
    resourceKey: HR_ROSTER_RESOURCE_KEY,
    scopeType: "global",
    scopeId: null,
    defaults: departmentWorkflowDefaults(businessActionKey),
  });
}

export async function assertHrDepartmentMutationCommitAllowed(input: {
  actorUserId: number;
  operation: ApprovalOperation;
  authorization?: DepartmentMutationAuthorization;
}) {
  if (input.authorization === "workflow-approved" || input.authorization === "lifecycle") {
    return serviceOk({ allowed: true as const });
  }
  const businessActionKey = departmentBusinessActionKey(input.operation);
  return assertBusinessActionDirectExecutionAllowed({
    businessActionKey,
    actorUserId: input.actorUserId,
    resourceKey: HR_ROSTER_RESOURCE_KEY,
    scopeType: "global",
    scopeId: null,
    defaults: departmentWorkflowDefaults(businessActionKey),
    blockedMessage: "该部门操作已配置为必须走流程，请提交审核",
  });
}

export function departmentBusinessActionKey(operation: ApprovalOperation) {
  return operation === "create"
    ? "hr.roster.department.create"
    : "hr.roster.department.update";
}

function departmentWorkflowDefaults(businessActionKey: string) {
  return {
    businessActionKey,
    mode: "optional" as const,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    handlerSource: "permission" as const,
  };
}
