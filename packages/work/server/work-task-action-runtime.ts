import { resolveBusinessActionRuntime } from "@workspace/platform/server/business-action-executor";
import { businessSpaceScopeId } from "@workspace/platform/server/business-space-permissions";
import {
  getWorkTaskPermissionResourceKey,
  normalizeWorkTargetType,
  type WorkSpaceTargetType,
} from "./access";

type WorkItemActionRuntimePermissions = {
  canCreate: boolean;
  canUpdate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
};

export async function resolveWorkItemActionRuntimes(
  userId: number,
  target: { targetType: WorkSpaceTargetType; targetId: number },
  permissions: WorkItemActionRuntimePermissions,
) {
  const resolve = (
    businessActionKey: "work.tasks.item.create" | "work.tasks.item.update",
    canDirectWrite: boolean,
  ) => resolveBusinessActionRuntime({
    businessActionKey,
    actor: {
      userId,
      canDirectWrite,
      canStartWorkflow: permissions.canSubmit,
      canProcessWorkflow: permissions.canApprove,
    },
    workflowApplicable: target.targetType !== "personal",
    resourceKey: getWorkTaskPermissionResourceKey(target.targetType),
    scopeType: target.targetType,
    scopeId: businessSpaceScopeId(normalizeWorkTargetType(target.targetType), target.targetId),
    defaults: {
      businessActionKey,
      mode: "optional",
      flowType: "approval",
      separationPolicy: "auto_pass_if_authorized",
      handlerSource: "permission",
    },
  });
  const [itemCreate, itemUpdate] = await Promise.all([
    resolve("work.tasks.item.create", permissions.canCreate),
    resolve("work.tasks.item.update", permissions.canUpdate),
  ]);
  return { itemCreate, itemUpdate };
}
