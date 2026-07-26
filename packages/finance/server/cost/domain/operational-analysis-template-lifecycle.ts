export const OPERATIONAL_ANALYSIS_REVISION_KINDS = [
  "legacy",
  "draft",
  "publish",
  "rollback",
  "discard",
  "archive",
  "restore",
] as const;

export type OperationalAnalysisRevisionKind = (typeof OPERATIONAL_ANALYSIS_REVISION_KINDS)[number];

export type OperationalAnalysisTemplateLifecycleState = {
  readonly status: "active" | "archived";
  readonly revision: number;
  readonly publishedRevision: number | null;
};

export type OperationalAnalysisTemplateLifecycleCommand =
  | { readonly kind: "publish" }
  | { readonly kind: "rollback"; readonly sourceRevision: number }
  | { readonly kind: "discard" }
  | { readonly kind: "archive" }
  | { readonly kind: "restore" };

export type OperationalAnalysisTemplateLifecyclePlan = {
  readonly changeKind: Exclude<OperationalAnalysisRevisionKind, "legacy" | "draft">;
  readonly nextRevision: number;
  readonly nextStatus: "active" | "archived";
  readonly nextPublishedRevision: number | null;
  readonly snapshotSourceRevision: number;
  readonly publishedAudit: "keep" | "set" | "clear";
  readonly archivedAudit: "keep" | "set" | "clear";
};

export type OperationalAnalysisTemplateLifecycleIssue =
  | "template_archived"
  | "template_active"
  | "no_draft"
  | "unpublished_template"
  | "dirty_draft"
  | "invalid_source_revision";

export type OperationalAnalysisTemplateLifecyclePlanResult =
  | { readonly ok: true; readonly plan: OperationalAnalysisTemplateLifecyclePlan }
  | { readonly ok: false; readonly issue: OperationalAnalysisTemplateLifecycleIssue };

export function hasOperationalAnalysisDraft(state: OperationalAnalysisTemplateLifecycleState) {
  return state.status === "active"
    && (state.publishedRevision === null || state.revision !== state.publishedRevision);
}

export function planOperationalAnalysisTemplateLifecycle(
  state: OperationalAnalysisTemplateLifecycleState,
  command: OperationalAnalysisTemplateLifecycleCommand,
): OperationalAnalysisTemplateLifecyclePlanResult {
  if (command.kind === "restore") {
    if (state.status !== "archived") return issue("template_active");
    return planned(
      state,
      command.kind,
      state.publishedRevision ?? state.revision,
      "active",
      null,
      "clear",
      "clear",
    );
  }

  if (state.status === "archived") return issue("template_archived");

  if (command.kind === "publish") {
    if (!hasOperationalAnalysisDraft(state)) return issue("no_draft");
    return planned(state, command.kind, state.revision, "active", state.revision + 1, "set", "keep");
  }

  if (command.kind === "rollback") {
    if (!Number.isInteger(command.sourceRevision) || command.sourceRevision <= 0 || command.sourceRevision > state.revision) {
      return issue("invalid_source_revision");
    }
    if (state.publishedRevision === null) return issue("unpublished_template");
    if (hasOperationalAnalysisDraft(state)) return issue("dirty_draft");
    return planned(state, command.kind, command.sourceRevision, "active", state.revision + 1, "set", "keep");
  }

  if (command.kind === "discard") {
    if (state.publishedRevision === null) return issue("unpublished_template");
    if (!hasOperationalAnalysisDraft(state)) return issue("no_draft");
    return planned(state, command.kind, state.publishedRevision, "active", state.revision + 1, "set", "keep");
  }

  if (state.publishedRevision !== null && hasOperationalAnalysisDraft(state)) return issue("dirty_draft");
  return planned(
    state,
    command.kind,
    state.publishedRevision ?? state.revision,
    "archived",
    state.publishedRevision,
    "keep",
    "set",
  );
}

function planned(
  state: OperationalAnalysisTemplateLifecycleState,
  changeKind: OperationalAnalysisTemplateLifecyclePlan["changeKind"],
  snapshotSourceRevision: number,
  nextStatus: OperationalAnalysisTemplateLifecyclePlan["nextStatus"],
  nextPublishedRevision: number | null,
  publishedAudit: OperationalAnalysisTemplateLifecyclePlan["publishedAudit"],
  archivedAudit: OperationalAnalysisTemplateLifecyclePlan["archivedAudit"],
): OperationalAnalysisTemplateLifecyclePlanResult {
  return {
    ok: true,
    plan: {
      changeKind,
      nextRevision: state.revision + 1,
      nextStatus,
      nextPublishedRevision,
      snapshotSourceRevision,
      publishedAudit,
      archivedAudit,
    },
  };
}

function issue(value: OperationalAnalysisTemplateLifecycleIssue): OperationalAnalysisTemplateLifecyclePlanResult {
  return { ok: false, issue: value };
}
