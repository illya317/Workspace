import { inferSourceKind } from "./work-item-source-validation";

export type WorkItemRelationState = {
  planId: number | null;
  itemType: string;
  sourceType: string;
  sourceKind: string | null;
  sourceMeetingId: number | null;
  sourceMeetingDecisionId: number | null;
  sourceMeetingActionCandidateId: number | null;
  sourceDepartmentId: number | null;
  linkedProjectId: number | null;
  linkedProjectPhaseId: number | null;
  parentWorkItemId: number | null;
};

export type WorkItemRelationPatch = Partial<WorkItemRelationState>;

export function sourcePatchTouched(patch: WorkItemRelationPatch) {
  return patch.sourceType !== undefined
    || patch.sourceKind !== undefined
    || patch.sourceMeetingId !== undefined
    || patch.sourceMeetingDecisionId !== undefined
    || patch.sourceMeetingActionCandidateId !== undefined
    || patch.sourceDepartmentId !== undefined
    || patch.linkedProjectId !== undefined
    || patch.linkedProjectPhaseId !== undefined;
}

export function effectiveWorkItemRelationInput(
  existing: WorkItemRelationState,
  patch: WorkItemRelationPatch,
): WorkItemRelationState {
  const sourceType = patch.sourceType === undefined ? existing.sourceType : patch.sourceType;
  const linkedProjectId = patch.linkedProjectId === undefined ? existing.linkedProjectId : patch.linkedProjectId;
  const linkedProjectPhaseId = patch.linkedProjectPhaseId === undefined ? existing.linkedProjectPhaseId : patch.linkedProjectPhaseId;
  const inferredSourceKind = inferSourceKind({
    sourceType,
    linkedProjectId,
    linkedProjectPhaseId,
  });
  return {
    planId: patch.planId === undefined ? existing.planId : patch.planId,
    itemType: patch.itemType === undefined ? existing.itemType : patch.itemType,
    sourceType,
    sourceKind: patch.sourceKind === undefined ? inferredSourceKind : patch.sourceKind,
    sourceMeetingId: patch.sourceMeetingId === undefined ? existing.sourceMeetingId : patch.sourceMeetingId,
    sourceMeetingDecisionId: patch.sourceMeetingDecisionId === undefined ? existing.sourceMeetingDecisionId : patch.sourceMeetingDecisionId,
    sourceMeetingActionCandidateId: patch.sourceMeetingActionCandidateId === undefined ? existing.sourceMeetingActionCandidateId : patch.sourceMeetingActionCandidateId,
    sourceDepartmentId: patch.sourceDepartmentId === undefined ? existing.sourceDepartmentId : patch.sourceDepartmentId,
    linkedProjectId,
    linkedProjectPhaseId,
    parentWorkItemId: patch.parentWorkItemId === undefined ? existing.parentWorkItemId : patch.parentWorkItemId,
  };
}
