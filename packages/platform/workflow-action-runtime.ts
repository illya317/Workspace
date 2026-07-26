import type {
  ActionFormPersistenceMode,
  ActionFormWorkflowRole,
  ActionWorkflowDisabledBehavior,
} from "./action-contract";
import type { ApprovalStatus } from "./server/approvals/types";
import type { WorkflowPolicyMode } from "./server/workflow-types";

export type ActionRuntimeAvailability = "available" | "unavailable";
export type ActionRuntimeExecutionMode = "direct" | "workflow" | null;
export type ActionRuntimeEditability = "editable" | "readonly";
export type ActionRuntimeBlockReason =
  | "permission_required"
  | "workflow_disabled"
  | "request_missing"
  | "request_owner_required"
  | "processor_required"
  | "policy_disabled"
  | "status_not_actionable";

export type ActionRuntimeDecision =
  | { allowed: true; reason: null }
  | { allowed: false; reason: ActionRuntimeBlockReason };

export type ActionRuntimeAction =
  | "form.cancel"
  | "record.save"
  | "workflow.request.submit"
  | "workflow.request.withdraw"
  | "workflow.request.revise"
  | "workflow.request.resubmit"
  | "workflow.request.cancel"
  | "workflow.request.approve"
  | "workflow.request.reject"
  | "workflow.request.reviewUpdate";

export interface ActionRuntimeRequestSnapshot {
  id: number | string;
  status: ApprovalStatus;
  submitterUserId: number;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
}

export interface ResolveActionRuntimeInput {
  businessActionKey: string;
  workflowPolicyMode: WorkflowPolicyMode;
  workflowWhenDisabled: ActionWorkflowDisabledBehavior;
  actor: {
    userId: number;
    canDirectWrite?: boolean;
    canStartWorkflow?: boolean;
    canProcessWorkflow?: boolean;
  };
  request?: ActionRuntimeRequestSnapshot | null;
}

export interface ActionRuntimeCapabilities {
  form: {
    cancel: ActionRuntimeDecision;
  };
  record: {
    save: ActionRuntimeDecision;
  };
  workflowRequest: {
    submit: ActionRuntimeDecision;
    withdraw: ActionRuntimeDecision;
    revise: ActionRuntimeDecision;
    resubmit: ActionRuntimeDecision;
    cancel: ActionRuntimeDecision;
    approve: ActionRuntimeDecision;
    reject: ActionRuntimeDecision;
    reviewUpdate: ActionRuntimeDecision;
  };
}

export interface ActionRuntime {
  businessActionKey: string;
  availability: ActionRuntimeAvailability;
  executionMode: ActionRuntimeExecutionMode;
  unavailableReason: ActionRuntimeBlockReason | null;
  persistenceMode: ActionFormPersistenceMode;
  workflowRole: ActionFormWorkflowRole;
  editability: ActionRuntimeEditability;
  requestId: number | string | null;
  status: ApprovalStatus | null;
  capabilities: ActionRuntimeCapabilities;
  actions: readonly ActionRuntimeAction[];
}

const ALLOWED: ActionRuntimeDecision = { allowed: true, reason: null };

export function resolveActionRuntime(input: ResolveActionRuntimeInput): ActionRuntime {
  if (input.request) return resolveRequestRuntime(input, input.request);
  if (!workflowModeEnabled(input.workflowPolicyMode)) {
    return input.workflowWhenDisabled === "direct_write"
      ? resolveDirectRuntime(input)
      : resolveUnavailableRuntime(input);
  }
  return resolveWorkflowEntryRuntime(input);
}

export function workflowModeEnabled(mode: WorkflowPolicyMode) {
  return mode === "optional" || mode === "required";
}

function resolveDirectRuntime(input: ResolveActionRuntimeInput): ActionRuntime {
  const canWrite = input.actor.canDirectWrite === true;
  const capabilities = emptyCapabilities("workflow_disabled");
  capabilities.record.save = canWrite ? ALLOWED : blocked("permission_required");
  capabilities.form.cancel = canWrite ? ALLOWED : blocked("status_not_actionable");
  return {
    businessActionKey: input.businessActionKey,
    availability: "available",
    executionMode: "direct",
    unavailableReason: null,
    persistenceMode: "active",
    workflowRole: "none",
    editability: canWrite ? "editable" : "readonly",
    requestId: null,
    status: null,
    capabilities,
    actions: canWrite ? ["record.save", "form.cancel"] : [],
  };
}

function resolveUnavailableRuntime(input: ResolveActionRuntimeInput): ActionRuntime {
  return {
    businessActionKey: input.businessActionKey,
    availability: "unavailable",
    executionMode: null,
    unavailableReason: "workflow_disabled",
    persistenceMode: "workflowDraft",
    workflowRole: "none",
    editability: "readonly",
    requestId: null,
    status: null,
    capabilities: emptyCapabilities("workflow_disabled"),
    actions: [],
  };
}

function resolveWorkflowEntryRuntime(input: ResolveActionRuntimeInput): ActionRuntime {
  const canStart = input.actor.canStartWorkflow === true;
  const capabilities = emptyCapabilities("request_missing");
  capabilities.record.save = blocked("workflow_disabled");
  capabilities.workflowRequest.submit = canStart ? ALLOWED : blocked("permission_required");
  capabilities.form.cancel = canStart ? ALLOWED : blocked("status_not_actionable");
  return {
    businessActionKey: input.businessActionKey,
    availability: "available",
    executionMode: "workflow",
    unavailableReason: null,
    persistenceMode: "workflowDraft",
    workflowRole: canStart ? "submitter" : "observer",
    editability: canStart ? "editable" : "readonly",
    requestId: null,
    status: null,
    capabilities,
    actions: canStart ? ["workflow.request.submit", "form.cancel"] : [],
  };
}

function resolveRequestRuntime(
  input: ResolveActionRuntimeInput,
  request: ActionRuntimeRequestSnapshot,
): ActionRuntime {
  const isSubmitter = request.submitterUserId === input.actor.userId;
  const isProcessor = !isSubmitter && input.actor.canProcessWorkflow === true;
  const capabilities = requestCapabilities(request, isSubmitter, isProcessor);
  const editability = capabilities.workflowRequest.revise.allowed
    || capabilities.workflowRequest.reviewUpdate.allowed
    ? "editable"
    : "readonly";
  capabilities.form.cancel = isSubmitter && request.status === "draft"
    ? ALLOWED
    : editability === "editable"
      ? ALLOWED
      : blocked("status_not_actionable");
  return {
    businessActionKey: input.businessActionKey,
    availability: "available",
    executionMode: "workflow",
    unavailableReason: null,
    persistenceMode: "workflowDraft",
    workflowRole: isSubmitter ? "submitter" : isProcessor ? "processor" : "observer",
    editability,
    requestId: request.id,
    status: request.status,
    capabilities,
    actions: visibleRequestActions(request.status, capabilities, isSubmitter, isProcessor),
  };
}

function requestCapabilities(
  request: ActionRuntimeRequestSnapshot,
  isSubmitter: boolean,
  isProcessor: boolean,
): ActionRuntimeCapabilities {
  const capabilities = emptyCapabilities("workflow_disabled");
  capabilities.record.save = blocked("workflow_disabled");
  capabilities.workflowRequest.submit = submitDecision(request, isSubmitter);
  capabilities.workflowRequest.resubmit = resubmitDecision(request, isSubmitter);
  capabilities.workflowRequest.withdraw = submitterDecision({
    isSubmitter,
    status: request.status,
    allowedStatuses: ["submitted"],
    policyEnabled: request.requestCanWithdraw,
  });
  capabilities.workflowRequest.revise = submitterDecision({
    isSubmitter,
    status: request.status,
    allowedStatuses: ["draft", "withdrawn", "rejected"],
    policyEnabled: request.requestCanRevise,
  });
  capabilities.workflowRequest.cancel = submitterDecision({
    isSubmitter,
    status: request.status,
    allowedStatuses: ["draft", "submitted", "withdrawn"],
    policyEnabled: request.requestCanCancel,
  });
  capabilities.workflowRequest.approve = processorDecision(request.status, isProcessor, true);
  capabilities.workflowRequest.reject = processorDecision(request.status, isProcessor, true);
  capabilities.workflowRequest.reviewUpdate = processorDecision(
    request.status,
    isProcessor,
    request.handlerCanRevise,
  );
  return capabilities;
}

function submitDecision(request: ActionRuntimeRequestSnapshot, isSubmitter: boolean): ActionRuntimeDecision {
  if (!isSubmitter) return blocked("request_owner_required");
  if (request.status === "draft" || request.status === "withdrawn") return ALLOWED;
  if (request.status !== "rejected") return blocked("status_not_actionable");
  return request.requestCanResubmit ? ALLOWED : blocked("policy_disabled");
}

function resubmitDecision(request: ActionRuntimeRequestSnapshot, isSubmitter: boolean): ActionRuntimeDecision {
  if (!isSubmitter) return blocked("request_owner_required");
  if (request.status === "withdrawn") return ALLOWED;
  if (request.status !== "rejected") return blocked("status_not_actionable");
  return request.requestCanResubmit ? ALLOWED : blocked("policy_disabled");
}

function submitterDecision(input: {
  isSubmitter: boolean;
  status: ApprovalStatus;
  allowedStatuses: readonly ApprovalStatus[];
  policyEnabled: boolean;
}): ActionRuntimeDecision {
  if (!input.isSubmitter) return blocked("request_owner_required");
  if (!input.allowedStatuses.includes(input.status)) return blocked("status_not_actionable");
  return input.policyEnabled ? ALLOWED : blocked("policy_disabled");
}

function processorDecision(
  status: ApprovalStatus,
  isProcessor: boolean,
  policyEnabled: boolean,
): ActionRuntimeDecision {
  if (!isProcessor) return blocked("processor_required");
  if (status !== "submitted") return blocked("status_not_actionable");
  return policyEnabled ? ALLOWED : blocked("policy_disabled");
}

function visibleRequestActions(
  status: ApprovalStatus,
  capabilities: ActionRuntimeCapabilities,
  isSubmitter: boolean,
  isProcessor: boolean,
): ActionRuntimeAction[] {
  if (isSubmitter) {
    if (status === "draft") {
      return capabilities.workflowRequest.submit.allowed
        ? ["workflow.request.submit", "form.cancel"]
        : ["form.cancel"];
    }
    if (status === "submitted") {
      return capabilities.workflowRequest.withdraw.allowed ? ["workflow.request.withdraw"] : [];
    }
    if (status === "withdrawn" || status === "rejected") {
      return [
        ...(capabilities.workflowRequest.revise.allowed ? ["workflow.request.revise" as const] : []),
        ...(capabilities.workflowRequest.resubmit.allowed ? ["workflow.request.resubmit" as const] : []),
      ];
    }
    return [];
  }
  if (isProcessor && status === "submitted") {
    return ["workflow.request.approve", "workflow.request.reject"];
  }
  return [];
}

function emptyCapabilities(reason: ActionRuntimeBlockReason): ActionRuntimeCapabilities {
  return {
    form: { cancel: blocked(reason) },
    record: { save: blocked(reason) },
    workflowRequest: {
      submit: blocked(reason),
      withdraw: blocked(reason),
      revise: blocked(reason),
      resubmit: blocked(reason),
      cancel: blocked(reason),
      approve: blocked(reason),
      reject: blocked(reason),
      reviewUpdate: blocked(reason),
    },
  };
}

function blocked(reason: ActionRuntimeBlockReason): ActionRuntimeDecision {
  return { allowed: false, reason };
}
