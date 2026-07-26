import type { BusinessActionRegistration } from "./business-action-registry";
import {
  actionWorkflowExecutionPath,
  actionWorkflowReadiness,
  isActionWorkflowCapable,
  type ActionContractMetadata,
  type ActionWorkflowConfigurableContract,
  type ActionWorkflowContract,
  type ActionWorkflowNativeContract,
} from "./action-contract";
import { getActionContractMetadata } from "./action-contract-registry";

export type WorkflowIntentKind = "default_flow" | "opt_in" | "direct_only" | "not_applicable" | "internal";
export type WorkflowReadinessState = "ready" | "native" | "partial" | "not_ready" | "direct_only" | "not_applicable" | "internal";
export type WorkflowExecutionPath = "approval_request" | "native_business_state";
export type WorkflowProductStatus =
  | "not_applicable"
  | "not_integrated"
  | "unset"
  | "enabled"
  | "default_enabled"
  | "disabled";
export type WorkflowProductState =
  | "not_applicable"
  | "not_ready"
  | "unset"
  | "enabled"
  | "default_enabled"
  | "disabled"
  | "config_error";

export type WorkflowIntent = {
  kind: WorkflowIntentKind;
  reason: string;
  risk?: "high";
};

export type WorkflowReadinessEvidence = {
  adapter?: boolean | "not_applicable";
  directWriteGuard?: boolean | "not_applicable";
  approvedCommitPath?: boolean | "native_transition" | "not_applicable";
  submissionRoutes?: boolean | "not_applicable";
  statusUi?: boolean | "not_applicable";
  ledgerVisibility?: boolean | "not_applicable";
};

export type WorkflowReadiness = {
  state: WorkflowReadinessState;
  executionPath?: WorkflowExecutionPath;
  evidence: WorkflowReadinessEvidence;
  missing?: readonly string[];
};

export type WorkflowActionReadinessMetadata = {
  workflowIntent: WorkflowIntent;
  workflowReadiness: WorkflowReadiness;
  productStatus: WorkflowProductStatus;
  workflowProductState: WorkflowProductState;
};

export type WorkflowReadinessWarning = {
  severity: "high" | "info";
  actionKey: string;
  state: WorkflowReadinessState;
  intent: WorkflowIntentKind;
  message: string;
};

const READY_APPROVAL_REQUEST: WorkflowReadiness = {
  state: "ready",
  executionPath: "approval_request",
  evidence: {
    adapter: true,
    directWriteGuard: true,
    approvedCommitPath: true,
    submissionRoutes: true,
    statusUi: true,
    ledgerVisibility: true,
  },
};

const READY_NATIVE_BUSINESS_STATE: WorkflowReadiness = {
  state: "native",
  executionPath: "native_business_state",
  evidence: {
    adapter: "not_applicable",
    directWriteGuard: true,
    approvedCommitPath: "native_transition",
    submissionRoutes: "not_applicable",
    statusUi: true,
    ledgerVisibility: "not_applicable",
  },
};

const NOT_READY: WorkflowReadiness = {
  state: "not_ready",
  evidence: {
    adapter: false,
    directWriteGuard: false,
    approvedCommitPath: false,
    submissionRoutes: false,
    statusUi: false,
    ledgerVisibility: false,
  },
  missing: ["workflow adapter", "direct write guard", "approved commit path", "submission route", "workflow status UI"],
};

const DIRECT_ONLY: WorkflowReadiness = {
  state: "direct_only",
  evidence: {
    adapter: "not_applicable",
    directWriteGuard: true,
    approvedCommitPath: true,
    submissionRoutes: "not_applicable",
    statusUi: "not_applicable",
    ledgerVisibility: "not_applicable",
  },
};

const NOT_APPLICABLE: WorkflowReadiness = {
  state: "not_applicable",
  evidence: {
    adapter: "not_applicable",
    directWriteGuard: "not_applicable",
    approvedCommitPath: "not_applicable",
    submissionRoutes: "not_applicable",
    statusUi: "not_applicable",
    ledgerVisibility: "not_applicable",
  },
};

const INTERNAL_ONLY: WorkflowReadiness = {
  state: "internal",
  evidence: {
    adapter: "not_applicable",
    directWriteGuard: "not_applicable",
    approvedCommitPath: "not_applicable",
    submissionRoutes: "not_applicable",
    statusUi: "not_applicable",
    ledgerVisibility: "not_applicable",
  },
};

export function workflowReadinessForAction(
  action: Pick<BusinessActionRegistration, "key" | "eligibility" | "writeKind">,
): WorkflowActionReadinessMetadata {
  const contract = getActionContractMetadata(action.key);
  if (contract?.workflow) {
    return workflowReadinessForContract(contract, contract.workflow);
  }
  if (action.eligibility === "internal") {
    return metadata({
      workflowIntent: { kind: "internal", reason: "Internal/system action is outside user-configurable workflow." },
      workflowReadiness: INTERNAL_ONLY,
    });
  }
  if (action.eligibility === "workflow_required" || action.eligibility === "workflow_optional") {
    return metadata({
      workflowIntent: intentForWorkflowAction(action),
      workflowReadiness: NOT_READY,
    });
  }
  return metadata({
    workflowIntent: isNotApplicableAction(action)
      ? { kind: "not_applicable", reason: directOnlyReason(action) }
      : { kind: "direct_only", reason: directOnlyReason(action) },
    workflowReadiness: isNotApplicableAction(action) ? NOT_APPLICABLE : DIRECT_ONLY,
  });
}

export function deriveWorkflowIntent(
  action: Pick<BusinessActionRegistration, "eligibility">,
): WorkflowIntent {
  if (action.eligibility === "internal") {
    return { kind: "internal", reason: "Internal/system action is outside user-configurable workflow." };
  }
  if (action.eligibility === "workflow_required" || action.eligibility === "workflow_optional") {
    return intentForWorkflowAction(action);
  }
  return { kind: "direct_only", reason: "Current business policy is direct permission only." };
}

export function getWorkflowReadiness(
  action: Pick<BusinessActionRegistration, "key" | "eligibility" | "writeKind">,
): WorkflowReadiness {
  return workflowReadinessForAction(action).workflowReadiness;
}

export function deriveWorkflowProductStatus(
  action: Pick<BusinessActionRegistration, "key" | "eligibility" | "writeKind">,
  policy?: { mode: string } | null,
): WorkflowProductStatus {
  const result = workflowReadinessForAction(action);
  if (policy && !canEnableWorkflowForReadiness(result.workflowReadiness)) return "not_integrated";
  if (policy) return policy.mode === "required" || policy.mode === "optional" ? "enabled" : "disabled";
  return result.productStatus;
}

export function canEnableWorkflowForReadiness(readiness: WorkflowReadiness) {
  return (readiness.state === "ready" && readiness.executionPath === "approval_request")
    || (readiness.state === "native" && readiness.executionPath === "native_business_state");
}

export function listWorkflowReadinessWarnings(
  actions: readonly Pick<BusinessActionRegistration, "key" | "eligibility" | "writeKind">[],
): WorkflowReadinessWarning[] {
  const warnings: WorkflowReadinessWarning[] = [];
  for (const action of actions) {
    const result = workflowReadinessForAction(action);
    if (result.workflowIntent.kind === "default_flow" && !canEnableWorkflowForReadiness(result.workflowReadiness)) {
      warnings.push({
        severity: "high",
        actionKey: action.key,
        state: result.workflowReadiness.state,
        intent: result.workflowIntent.kind,
        message: "Default-flow action is not workflow-ready.",
      });
    } else if (result.workflowIntent.kind === "opt_in" && !canEnableWorkflowForReadiness(result.workflowReadiness)) {
      warnings.push({
        severity: "info",
        actionKey: action.key,
        state: result.workflowReadiness.state,
        intent: result.workflowIntent.kind,
        message: "Opt-in action is registered but not workflow-ready.",
      });
    }
  }
  return warnings;
}

export function listUnknownWorkflowReadinessKeys(
  actions: readonly Pick<BusinessActionRegistration, "key">[],
) {
  void actions;
  return [];
}

function metadata(
  input: Omit<WorkflowActionReadinessMetadata, "productStatus" | "workflowProductState">,
): WorkflowActionReadinessMetadata {
  const productStatus = defaultProductStatus(input.workflowIntent, input.workflowReadiness);
  return {
    ...input,
    productStatus,
    workflowProductState: defaultProductState(input.workflowIntent, input.workflowReadiness, productStatus),
  };
}

function workflowReadinessForContract(
  contract: Pick<ActionContractMetadata, "key" | "label">,
  workflow: ActionWorkflowContract,
): WorkflowActionReadinessMetadata {
  if (!isActionWorkflowCapable(workflow)) {
    return metadata({
      workflowIntent: { kind: "not_applicable", reason: workflow.reason },
      workflowReadiness: NOT_APPLICABLE,
    });
  }
  return metadata({
    workflowIntent: intentForContractWorkflow(contract, workflow),
    workflowReadiness: readinessForContractWorkflow(workflow),
  });
}

function intentForContractWorkflow(
  contract: Pick<ActionContractMetadata, "key" | "label">,
  workflow: ActionWorkflowConfigurableContract | ActionWorkflowNativeContract,
): WorkflowIntent {
  if (workflow.defaultExecutionMode === "workflow" || workflow.defaultExecutionMode === "native") {
    return {
      kind: "default_flow",
      risk: "high",
      reason: `ActionContract marks ${contract.label || contract.key} as workflow by default.`,
    };
  }
  return {
    kind: "opt_in",
    reason: `ActionContract marks ${contract.label || contract.key} as workflow-capable but direct by default.`,
  };
}

function readinessForContractWorkflow(workflow: ActionWorkflowContract): WorkflowReadiness {
  const readiness = actionWorkflowReadiness(workflow);
  const executionPath = actionWorkflowExecutionPath(workflow);
  if (readiness === "ready" && executionPath === "approval_request") return READY_APPROVAL_REQUEST;
  if (readiness === "native" && executionPath === "native_business_state") return READY_NATIVE_BUSINESS_STATE;
  return NOT_READY;
}

function intentForWorkflowAction(action: Pick<BusinessActionRegistration, "eligibility">): WorkflowIntent {
  if (action.eligibility === "workflow_required") {
    return { kind: "default_flow", risk: "high", reason: "Registry marks this business action as default workflow." };
  }
  return { kind: "opt_in", reason: "Workflow-ready action defaults to direct permission until a policy enables workflow." };
}

function defaultProductStatus(intent: WorkflowIntent, readiness: WorkflowReadiness): WorkflowProductStatus {
  if (
    intent.kind === "internal" ||
    intent.kind === "direct_only" ||
    intent.kind === "not_applicable" ||
    readiness.state === "direct_only" ||
    readiness.state === "internal" ||
    readiness.state === "not_applicable"
  ) {
    return "not_applicable";
  }
  if (readiness.state === "not_ready" || readiness.state === "partial") return "not_integrated";
  if (intent.kind === "default_flow") return "default_enabled";
  return "unset";
}

function defaultProductState(
  intent: WorkflowIntent,
  readiness: WorkflowReadiness,
  productStatus: WorkflowProductStatus,
): WorkflowProductState {
  if (
    intent.kind === "internal" ||
    intent.kind === "direct_only" ||
    intent.kind === "not_applicable" ||
    readiness.state === "direct_only" ||
    readiness.state === "internal" ||
    readiness.state === "not_applicable"
  ) {
    return "not_applicable";
  }
  if (productStatus === "not_integrated") return "not_ready";
  return productStatus;
}

function directOnlyReason(action: Pick<BusinessActionRegistration, "key" | "writeKind">) {
  if (action.writeKind === "delete" || action.writeKind === "archive") return "Delete/archive actions stay permission-only in workflow V1.";
  if (action.writeKind === "approve" || action.writeKind === "reject") return "Approve/reject are workflow handling actions, not workflow request entries.";
  if (action.writeKind === "submit" || action.writeKind === "reverse") return "Submit/withdraw are workflow request actions, not business write entries.";
  if (action.writeKind === "export") return "Export/download actions stay outside write workflow.";
  if (action.writeKind === "import") return "Import/bulk data management actions stay outside workflow V1.";
  if (action.key.startsWith("finance.")) return "Finance ledger/config/budget/cost management stays outside workflow V1.";
  if (action.key.startsWith("capitalSecurities.")) return "Capital Securities governance actions stay outside workflow V1.";
  return "Current business policy is direct permission only.";
}

function isNotApplicableAction(action: Pick<BusinessActionRegistration, "key" | "writeKind">) {
  return action.writeKind === "export"
    || action.writeKind === "import"
    || action.writeKind === "submit"
    || action.writeKind === "approve"
    || action.writeKind === "reject"
    || action.writeKind === "reverse"
    || action.key.startsWith("finance.")
    || action.key.startsWith("capitalSecurities.");
}
