import { useMemo } from "react";
import type { WorkItem, WorkItemType, WorkPlan } from "./types";

export function useOkrStageControls({
  activePlan,
  works,
  canCreate,
  canEditPlan,
  canEditWork,
  canSubmitObjective,
}: {
  activePlan: WorkPlan | null;
  works: WorkItem[];
  canCreate: boolean;
  canEditPlan: boolean;
  canEditWork: boolean;
  canSubmitObjective: boolean;
}) {
  const activeOkrStage = activePlan?.okrStage ?? "objective_draft";
  const planKind = activePlan?.kind ?? "okr";
  const isRoutinePlan = planKind === "routine";
  const maintenance = activePlan?.maintenance ?? { plan: false, objective: false, task: false, keyResult: false };
  const governance = activePlan?.governance;
  const targetEditable = governance ? governance.facets.target.editable : maintenance.objective;
  const executionEditable = governance ? governance.facets.execution.editable : maintenance.task;
  const rootObjectives = useMemo(
    () => works.filter((work) => work.itemType === "objective" && !work.parentWorkItemId),
    [works],
  );
  const createAllowedItemTypes = useMemo<WorkItemType[]>(() => {
    if (!activePlan) return [];
    return (["objective", "task", "key_result"] as WorkItemType[]).filter((itemType) => {
      if (itemType === "objective") return targetEditable;
      if (itemType === "key_result") return targetEditable;
      return executionEditable;
    });
  }, [activePlan, executionEditable, targetEditable]);
  const defaultCreateItemType: WorkItemType = createAllowedItemTypes[0] ?? (isRoutinePlan ? "task" : "objective");
  return {
    activeOkrStage,
    rootObjectives,
    createAllowedItemTypes,
    defaultCreateItemType,
    canEditPlan: canEditPlan && (governance ? targetEditable : maintenance.plan),
    canEditObjectives: canEditWork && targetEditable,
    canEditTasks: canEditWork && executionEditable,
    canEditKrs: canEditWork && targetEditable,
    canSubmitObjectiveReview: canSubmitObjective && !isRoutinePlan,
    canSubmitKrReview: false,
    canCreateNode: canCreate && createAllowedItemTypes.length > 0,
    createNodeLabel: isRoutinePlan ? "新增细项" : defaultCreateItemType === "objective" ? "新增目标" : defaultCreateItemType === "key_result" ? "新增关键结果" : "新增任务",
    nodeSaveLabel: defaultCreateItemType === "objective" ? "保存目标" : defaultCreateItemType === "key_result" ? "保存关键结果" : "新增任务",
    krReviewVisible: false,
  };
}
