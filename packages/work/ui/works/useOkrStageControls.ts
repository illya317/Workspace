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
  const rootObjectives = useMemo(
    () => works.filter((work) => work.itemType === "objective" && !work.parentWorkItemId),
    [works],
  );
  const createAllowedItemTypes = useMemo<WorkItemType[]>(() => {
    if (!activePlan) return [];
    if (isRoutinePlan) return ["task"];
    return ["objective", "task", "key_result"];
  }, [activePlan, isRoutinePlan]);
  const defaultCreateItemType: WorkItemType = isRoutinePlan ? "task" : "objective";
  return {
    activeOkrStage,
    rootObjectives,
    createAllowedItemTypes,
    defaultCreateItemType,
    canEditObjectives: canEdit && !isRoutinePlan && activeOkrStage === "objective_draft",
    canEditTasks: canEdit && (isRoutinePlan || (activeOkrStage !== "objective_submitted" && activeOkrStage !== "closed")),
    canEditKrs: canEdit && !isRoutinePlan && activeOkrStage !== "objective_submitted" && activeOkrStage !== "closed",
    canSubmitObjectiveReview: canSubmit && !isRoutinePlan && activeOkrStage === "objective_draft",
    canSubmitKrReview: false,
    canAdjustKrReview: false,
    canCreateNode: canCreate && createAllowedItemTypes.length > 0,
    createNodeLabel: isRoutinePlan ? "新增细项" : "新增目标",
    nodeSaveLabel: defaultCreateItemType === "objective" ? "保存目标" : "新增任务",
    krReviewVisible: false,
  };
}
