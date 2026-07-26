import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";

export type WorkOkrGovernanceActionKind =
  | "objective_submit"
  | "objective_revise"
  | "report_submit"
  | "report_correct";

export type WorkOkrGovernanceRuntime = Pick<
  ActionRuntime,
  "businessActionKey" | "executionMode" | "editability" | "requestId" | "status"
>;

export type WorkOkrGovernanceMode = "free_edit" | "workflow" | "unavailable";
export type WorkOkrGovernanceFacet = "target" | "execution" | "result";
export type WorkOkrGovernanceLockReason =
  | "archived"
  | "permission_required"
  | "request_in_flight"
  | "action_unavailable";

export type WorkOkrGovernanceBadge = {
  key: "free_edit" | "workflow" | "unavailable" | "readonly" | "archived";
  label: string;
};

export type WorkOkrGovernanceActionSelection = {
  kind: WorkOkrGovernanceActionKind;
  runtime: WorkOkrGovernanceRuntime;
};

export type WorkOkrGovernanceFacetPolicy = {
  facet: WorkOkrGovernanceFacet;
  editable: boolean;
  lockReason: WorkOkrGovernanceLockReason | null;
  lockRequestId: number | string | null;
  action: WorkOkrGovernanceActionSelection | null;
  submissionWindow: {
    enforced: boolean;
    open: boolean;
  };
};

export type WorkOkrGovernancePolicy = {
  mode: WorkOkrGovernanceMode;
  lifecycleStatus: string;
  badges: readonly WorkOkrGovernanceBadge[];
  facets: {
    target: WorkOkrGovernanceFacetPolicy;
    execution: WorkOkrGovernanceFacetPolicy;
    result: WorkOkrGovernanceFacetPolicy;
  };
};

export function workOkrFacetMutationIssue(
  facet: WorkOkrGovernanceFacetPolicy,
  label: string,
) {
  if (facet.editable) return null;
  if (facet.lockReason === "request_in_flight") {
    return {
      message: `${label}已有在途申请${facet.lockRequestId ? `（${facet.lockRequestId}）` : ""}，不能重复保存或提交`,
      status: 409,
    };
  }
  return {
    message: facet.lockReason === "permission_required" ? `当前用户不能维护${label}` : `${label}当前不可维护`,
    status: facet.lockReason === "permission_required" ? 403 : 409,
  };
}

export type WorkOkrGovernancePolicyInput = {
  canUpdate: boolean;
  isArchived: boolean;
  lifecycleStatus: string;
  targetConfirmed: boolean;
  resultConfirmed: boolean;
  actionRuntimes: {
    objectiveSubmit: WorkOkrGovernanceRuntime;
    objectiveRevise: WorkOkrGovernanceRuntime;
    reportSubmit: WorkOkrGovernanceRuntime;
    reportCorrect: WorkOkrGovernanceRuntime;
  };
  submissionWindows?: {
    targetOpen: boolean;
    resultOpen: boolean;
  };
};

const IN_FLIGHT_REQUEST_STATUSES = new Set(["submitted", "committing"]);

export function workOkrRequestBindingPriority(status: string) {
  if (status === "committing") return 5;
  if (status === "submitted") return 4;
  if (status === "draft") return 3;
  if (status === "rejected") return 2;
  if (status === "withdrawn") return 1;
  return 0;
}

/**
 * Resolves field editability independently from the legacy OKR lifecycle stage.
 * Submission windows constrain workflow submission only; they never make a facet readonly.
 */
export function resolveWorkOkrGovernancePolicy(
  input: WorkOkrGovernancePolicyInput,
): WorkOkrGovernancePolicy {
  const targetAction = selectTargetAction(input);
  const resultAction = selectResultAction(input);
  const mode = resolveGovernanceMode(targetAction.runtime, resultAction.runtime);
  const facets = {
    target: resolveGovernedFacet({
      facet: "target",
      input,
      action: targetAction,
      submissionWindowOpen: input.submissionWindows?.targetOpen ?? true,
    }),
    execution: resolveExecutionFacet(input),
    result: resolveGovernedFacet({
      facet: "result",
      input,
      action: resultAction,
      submissionWindowOpen: input.submissionWindows?.resultOpen ?? true,
    }),
  };

  return {
    mode,
    lifecycleStatus: input.lifecycleStatus,
    badges: resolveBadges(input, mode, facets),
    facets,
  };
}

function selectTargetAction(input: WorkOkrGovernancePolicyInput): WorkOkrGovernanceActionSelection {
  return input.targetConfirmed
    ? { kind: "objective_revise", runtime: input.actionRuntimes.objectiveRevise }
    : { kind: "objective_submit", runtime: input.actionRuntimes.objectiveSubmit };
}

function selectResultAction(input: WorkOkrGovernancePolicyInput): WorkOkrGovernanceActionSelection {
  return input.resultConfirmed
    ? { kind: "report_correct", runtime: input.actionRuntimes.reportCorrect }
    : { kind: "report_submit", runtime: input.actionRuntimes.reportSubmit };
}

function resolveGovernedFacet(input: {
  facet: "target" | "result";
  input: WorkOkrGovernancePolicyInput;
  action: WorkOkrGovernanceActionSelection;
  submissionWindowOpen: boolean;
}): WorkOkrGovernanceFacetPolicy {
  const common = {
    facet: input.facet,
    action: input.action,
    submissionWindow: {
      enforced: input.action.runtime.executionMode === "workflow",
      open: input.submissionWindowOpen,
    },
  } as const;

  if (input.input.isArchived) {
    return { ...common, editable: false, lockReason: "archived", lockRequestId: null };
  }
  if (!input.action.runtime.executionMode) {
    return { ...common, editable: false, lockReason: "action_unavailable", lockRequestId: null };
  }
  if (input.action.runtime.executionMode === "workflow"
    && input.action.runtime.status
    && IN_FLIGHT_REQUEST_STATUSES.has(input.action.runtime.status)) {
    return {
      ...common,
      editable: false,
      lockReason: "request_in_flight",
      lockRequestId: input.action.runtime.requestId,
    };
  }
  if (input.action.runtime.requestId !== null && input.action.runtime.editability === "readonly") {
    return {
      ...common,
      editable: false,
      lockReason: "request_in_flight",
      lockRequestId: input.action.runtime.requestId,
    };
  }
  if (input.action.runtime.editability === "readonly") {
    return { ...common, editable: false, lockReason: "permission_required", lockRequestId: null };
  }
  return { ...common, editable: true, lockReason: null, lockRequestId: null };
}

function resolveExecutionFacet(input: WorkOkrGovernancePolicyInput): WorkOkrGovernanceFacetPolicy {
  const lockReason = input.isArchived
    ? "archived" as const
    : input.canUpdate
      ? null
      : "permission_required" as const;
  return {
    facet: "execution",
    editable: lockReason === null,
    lockReason,
    lockRequestId: null,
    action: null,
    submissionWindow: { enforced: false, open: true },
  };
}

function resolveGovernanceMode(
  targetRuntime: WorkOkrGovernanceRuntime,
  resultRuntime: WorkOkrGovernanceRuntime,
): WorkOkrGovernanceMode {
  if (targetRuntime.executionMode === "direct" && resultRuntime.executionMode === "direct") {
    return "free_edit";
  }
  if (targetRuntime.executionMode === "workflow" || resultRuntime.executionMode === "workflow") {
    return "workflow";
  }
  return "unavailable";
}

function resolveBadges(
  input: WorkOkrGovernancePolicyInput,
  mode: WorkOkrGovernanceMode,
  facets: WorkOkrGovernancePolicy["facets"],
): readonly WorkOkrGovernanceBadge[] {
  if (input.isArchived) return [{ key: "archived", label: "已归档" }];

  const modeBadge: WorkOkrGovernanceBadge = mode === "free_edit"
    ? { key: "free_edit", label: "流程关闭" }
    : mode === "workflow"
      ? { key: "workflow", label: mixedWorkflowLabel(facets) }
      : { key: "unavailable", label: "流程不可用" };
  return facets.target.editable || facets.execution.editable || facets.result.editable
    ? [modeBadge]
    : [modeBadge, { key: "readonly", label: "只读" }];
}

function mixedWorkflowLabel(facets: WorkOkrGovernancePolicy["facets"]) {
  const facetLabel = (label: string, facet: WorkOkrGovernanceFacetPolicy) => {
    if (facet.lockReason === "request_in_flight") return `${label}：审批中`;
    if (facet.action?.runtime.executionMode === "workflow") return `${label}：流程`;
    if (facet.action?.runtime.executionMode === "direct") return `${label}：自由编辑`;
    return `${label}：不可用`;
  };
  return [facetLabel("目标", facets.target), facetLabel("结果", facets.result)].join(" · ");
}
