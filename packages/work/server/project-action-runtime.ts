import { resolveBusinessActionRuntime } from "@workspace/platform/server/business-action-executor";
import { canSubmitWorkProjectAction } from "./access";

export const WORK_PROJECT_CREATE_ACTION = "work.projects.project.create";
export const WORK_PROJECT_INITIATION_RESOURCE_KEY = "work.projects.initiate";

export const WORK_PROJECT_CREATE_WORKFLOW_DEFAULTS = {
  businessActionKey: WORK_PROJECT_CREATE_ACTION,
  scopeType: "global" as const,
  mode: "required" as const,
  flowType: "approval" as const,
  separationPolicy: "auto_pass_if_authorized" as const,
  handlerSource: "department_owner" as const,
  workflowNodes: [{
    key: "work-project-enabling-departments-confirm",
    kind: "approval" as const,
    assignees: [{ fieldKind: "relationship" as const, value: "department_owner" }],
    approvalMode: "all" as const,
  }],
  handlerCanRevise: false,
  requestCanWithdraw: true,
  requestCanResubmit: false,
  requestCanCancel: true,
  requestCanRevise: false,
};

export async function resolveWorkProjectCreateActionRuntime(userId: number) {
  const canStartWorkflow = await canSubmitWorkProjectAction(userId);
  return resolveBusinessActionRuntime({
    businessActionKey: WORK_PROJECT_CREATE_ACTION,
    actor: { userId, canDirectWrite: false, canStartWorkflow },
    resourceKey: WORK_PROJECT_INITIATION_RESOURCE_KEY,
    scopeType: "global",
    scopeId: null,
    defaults: WORK_PROJECT_CREATE_WORKFLOW_DEFAULTS,
  });
}
