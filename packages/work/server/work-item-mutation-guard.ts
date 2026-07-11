import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { businessSpaceScopeId } from "@workspace/platform/server/business-space-permissions";
import {
  getWorkTaskPermissionResourceKey,
  normalizeWorkTargetType,
} from "./access";

export type WorkItemMutationAuthorization = "direct" | "workflow-approved";

export async function assertWorkItemMutationCommitAllowed(input: {
  operation: "create" | "update";
  actorUserId?: number | null;
  targetType: string;
  targetId: number;
  authorization?: WorkItemMutationAuthorization;
}) {
  if (input.authorization === "workflow-approved") return serviceOk({ allowed: true as const });
  if (!input.actorUserId) return serviceError("工作项写入缺少操作人", 401);
  const targetType = normalizeWorkTargetType(input.targetType);
  const businessActionKey = input.operation === "create"
    ? "work.tasks.item.create"
    : "work.tasks.item.update";
  return assertBusinessActionDirectExecutionAllowed({
    businessActionKey,
    actorUserId: input.actorUserId,
    workflowApplicable: targetType !== "personal",
    resourceKey: getWorkTaskPermissionResourceKey(targetType),
    scopeType: targetType,
    scopeId: businessSpaceScopeId(targetType, input.targetId),
    defaults: {
      businessActionKey,
      mode: "optional",
      flowType: "approval",
      separationPolicy: "auto_pass_if_authorized",
      handlerSource: "permission",
    },
  });
}
