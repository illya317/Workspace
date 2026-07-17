import { resolveBusinessActionRuntime } from "@workspace/platform/server/business-action-executor";
import { businessSpaceScopeId } from "@workspace/platform/server/business-space-permissions";
import {
  getWorkTaskPermissionResourceKey,
  normalizeWorkTargetType,
  type WorkSpaceTargetType,
} from "./access";
import { workOkrWorkflowBusinessActionKey } from "./task-approval-helpers";

type WorkItemActionRuntimePermissions = {
  canCreate: boolean;
  canUpdate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
};

export async function resolveWorkTaskActionRuntimes(
  userId: number,
  target: { targetType: WorkSpaceTargetType; targetId: number },
  permissions: WorkItemActionRuntimePermissions,
) {
  const resolvePermissionOnly = (businessActionKey: string, canDirectWrite: boolean) =>
    resolveBusinessActionRuntime({
      businessActionKey,
      actor: { userId, canDirectWrite },
      workflowApplicable: false,
    });
  const resolveConfigurable = (
    businessActionKey: string,
    canDirectWrite: boolean,
    workflowApplicable = true,
  ) => resolveBusinessActionRuntime({
    businessActionKey,
    actor: {
      userId,
      canDirectWrite,
      canStartWorkflow: permissions.canSubmit,
      canProcessWorkflow: permissions.canApprove,
    },
    workflowApplicable,
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
  const planRevisionBusinessActionKey = workOkrWorkflowBusinessActionKey({
    kind: "objective_revise",
    workspaceTargetType: target.targetType,
  });
  const objectiveSubmitBusinessActionKey = workOkrWorkflowBusinessActionKey({
    kind: "objective_submit",
    workspaceTargetType: target.targetType,
  });
  const reportSubmitBusinessActionKey = workOkrWorkflowBusinessActionKey({
    kind: "report_submit",
    workspaceTargetType: target.targetType,
  });
  const reportCorrectBusinessActionKey = workOkrWorkflowBusinessActionKey({
    kind: "report_correct",
    workspaceTargetType: target.targetType,
  });
  const [itemCreate, itemUpdate, planCreate, planSave, objectiveSubmit, reportSubmit, objectiveRevise, reportCorrect, collaboration] = await Promise.all([
    resolveConfigurable("work.tasks.item.create", permissions.canCreate, target.targetType !== "personal"),
    resolveConfigurable("work.tasks.item.update", permissions.canUpdate, target.targetType !== "personal"),
    resolvePermissionOnly("work.tasks.plan.create", permissions.canCreate),
    resolvePermissionOnly("work.tasks.plan.save", permissions.canUpdate),
    resolveConfigurable(objectiveSubmitBusinessActionKey, permissions.canUpdate),
    resolveConfigurable(reportSubmitBusinessActionKey, permissions.canUpdate),
    resolveConfigurable(planRevisionBusinessActionKey, permissions.canUpdate),
    resolveConfigurable(reportCorrectBusinessActionKey, permissions.canUpdate),
    resolveConfigurable("work.tasks.collaboration.submit", permissions.canUpdate, target.targetType === "department"),
  ]);
  return {
    itemCreate,
    itemUpdate,
    planCreate,
    planSave,
    objectiveSubmit,
    reportSubmit,
    objectiveRevise,
    reportCorrect,
    planRevision: objectiveRevise,
    collaboration,
  };
}
