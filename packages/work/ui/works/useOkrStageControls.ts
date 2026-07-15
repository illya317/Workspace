import { useMemo } from "react";
import type { WorkItem, WorkItemType, WorkPlan } from "./types";

export function useOkrStageControls({
  activePlan,
  works,
  canCreate,
  canEdit,
  canSubmit,
}: {
  activePlan: WorkPlan | null;
  works: WorkItem[];
  canCreate: boolean;
  canEdit: boolean;
  canSubmit: boolean;
}) {
  const activeOkrStage = activePlan?.okrStage ?? "objective_draft";
  const planKind = activePlan?.kind ?? "okr";
  const isRoutinePlan = planKind === "routine";
  const maintenance = activePlan?.maintenance ?? { plan: false, objective: false, task: false, keyResult: false };
  const rootObjectives = useMemo(
    () => works.filter((work) => work.itemType === "objective" && !work.parentWorkItemId),
    [works],
  );
  const createAllowedItemTypes = useMemo<WorkItemType[]>(() => {
    if (!activePlan) return [];
    return (["objective", "task", "key_result"] as WorkItemType[]).filter((itemType) => {
      if (itemType === "objective") return maintenance.objective;
      if (itemType === "key_result") return maintenance.keyResult;
      return maintenance.task;
    });
  }, [activePlan, maintenance.keyResult, maintenance.objective, maintenance.task]);
  const defaultCreateItemType: WorkItemType = createAllowedItemTypes[0] ?? (isRoutinePlan ? "task" : "objective");
  return {
    activeOkrStage,
    rootObjectives,
    createAllowedItemTypes,
    defaultCreateItemType,
    canEditPlan: canEdit && maintenance.plan,
    canEditObjectives: canEdit && maintenance.objective,
    canEditTasks: canEdit && maintenance.task,
    canEditKrs: canEdit && maintenance.keyResult,
    canSubmitObjectiveReview: canSubmit && !isRoutinePlan && activeOkrStage === "objective_draft",
    canSubmitKrReview: false,
    canAdjustKrReview: false,
    canCreateNode: canCreate && createAllowedItemTypes.length > 0,
    createNodeLabel: isRoutinePlan ? "新增细项" : defaultCreateItemType === "objective" ? "新增目标" : defaultCreateItemType === "key_result" ? "新增考核结果" : "新增任务",
    nodeSaveLabel: defaultCreateItemType === "objective" ? "保存目标" : defaultCreateItemType === "key_result" ? "保存考核结果" : "新增任务",
    krReviewVisible: false,
  };
}
