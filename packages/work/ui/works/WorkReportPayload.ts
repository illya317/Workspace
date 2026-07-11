import type { WorkReportItem } from "./types";

export type WorkReportStage = "kr" | "final";

export const WORK_REPORT_STAGE_OPTIONS: Array<{ value: WorkReportStage; label: string }> = [
  { value: "kr", label: "期初目标" },
  { value: "final", label: "考核结果" },
];

export function normalizeWorkReportStage(value: unknown): WorkReportStage {
  return value === "kr" ? "kr" : "final";
}

export function workReportStageLabel(stage: WorkReportStage) {
  return stage === "kr" ? "期初目标" : "考核结果";
}

export function workReportItemsPayload(items: WorkReportItem[]) {
  return items.map((item, index) => ({
    workPlanId: item.workPlanId,
    workItemId: item.workItemId,
    title: item.title,
    workPlanTitle: item.workPlanTitle,
    workPlanKind: item.workPlanKind,
    workItemType: item.workItemType,
    parentWorkItemId: item.parentWorkItemId,
    parentTitle: item.parentTitle,
    objectiveTitleSnapshot: item.objectiveTitleSnapshot,
    keyResultTitleSnapshot: item.keyResultTitleSnapshot,
    reportItemKind: item.reportItemKind,
    workItemStatusSnapshot: item.workItemStatusSnapshot,
    snapshotPlannedStartDate: item.snapshotPlannedStartDate,
    snapshotPlannedEndDate: item.snapshotPlannedEndDate,
    snapshotActualEndDate: item.snapshotActualEndDate,
    snapshotCompletedAt: item.snapshotCompletedAt,
    previousPlanSnapshot: item.previousPlanSnapshot,
    currentKeyResult: item.currentKeyResult,
    nextObjective: item.nextObjective,
    note: item.note,
    selfScore: item.selfScore,
    performanceScore: item.performanceScore,
    sortOrder: item.sortOrder || (index + 1) * 10,
  }));
}
