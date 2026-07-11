import { getActionContractMetadata } from "../action-contract-registry";
import type { ActionWorkflowNodeContract } from "../action-contract";
import type { WorkflowBusinessActionSettingsDto } from "./workflow-action-settings";
import type { WorkflowPolicyDefaults } from "./workflow-policy-defaults";

export function workflowDefaultsForRegistration(
  registration: WorkflowBusinessActionSettingsDto | null,
  defaults: WorkflowPolicyDefaults,
): WorkflowPolicyDefaults {
  const contract = getActionContractMetadata(registration?.key ?? "");
  const workflow = contract?.workflow;
  if (!workflow || workflow.kind === "not_applicable" || workflow.defaultExecutionMode !== "workflow") return defaults;
  const canUseDirectDefault = workflow.allowDirectOverride && (defaults.mode === "permission_only" || defaults.mode === "direct");
  return {
    ...defaults,
    mode: canUseDirectDefault ? defaults.mode : "required",
    flowType: defaults.flowType ?? "approval",
    separationPolicy: defaults.separationPolicy ?? workflow.routing.separationPolicy,
    handlerSource: defaults.handlerSource ?? workflow.routing.handlerSource,
    workflowNodes: defaults.workflowNodes ?? workflowDefaultNodes(workflow.defaultDefinition.nodes),
    handlerCanRevise: defaults.handlerCanRevise ?? workflow.mutationPolicy.handlerCanRevise,
    requestCanWithdraw: defaults.requestCanWithdraw ?? workflow.mutationPolicy.requestCanWithdraw,
    requestCanRevise: defaults.requestCanRevise ?? workflow.mutationPolicy.requestCanRevise,
    requestCanResubmit: defaults.requestCanResubmit ?? workflow.mutationPolicy.requestCanResubmit,
    requestCanCancel: defaults.requestCanCancel ?? workflow.mutationPolicy.requestCanCancel,
  };
}

function workflowDefaultNodes(nodes: readonly ActionWorkflowNodeContract[]) {
  return nodes.flatMap((node) => node.kind === "approval"
    ? [{
        key: node.key,
        kind: "approval" as const,
        assignees: workflowDefaultAssignees(node.assignee),
        approvalMode: node.approvalMode === "all" ? "all" as const : "any_one" as const,
      }]
    : []);
}

function workflowDefaultAssignees(assignee: { kind: string; userIds?: readonly number[] }) {
  if (assignee.kind === "direct_manager" || assignee.kind === "submitter_manager" || assignee.kind === "previous_actor_manager") {
    return [{ fieldKind: "relationship" as const, value: "direct_manager" }];
  }
  if (assignee.kind === "department_owner") return [{ fieldKind: "relationship" as const, value: "department_owner" }];
  if (assignee.kind === "employee" && assignee.userIds?.[0]) return [{ fieldKind: "employee" as const, value: String(assignee.userIds[0]) }];
  return [];
}
