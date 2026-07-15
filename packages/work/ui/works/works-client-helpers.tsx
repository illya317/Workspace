import { createMetricsSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, FormSurfaceActionSpec, FormSurfaceProps } from "@workspace/core/ui";
import { listWorkPlans } from "./api";
import { createEmptyWorkDraft } from "./model";
import type { RoutineTaskType, WorkItem, WorkItemDraft, WorkItemType, WorkPlan, WorkTarget, WorkTaskSpace } from "./types";

export function sameTarget(a: WorkTarget | null | undefined, b: WorkTarget | null | undefined) {
  return Boolean(a && b && a.targetType === b.targetType && a.targetId === b.targetId);
}

export function createSpaceMetricsSection(space: WorkTaskSpace): BodySurfaceSectionSpec {
  return createMetricsSection("space-metrics", {
    metrics: [
      { key: "objective", label: "目标", value: space.counts.objective,  },
      { key: "keyResult", label: "关键结果", value: space.counts.keyResult,  },
      { key: "task", label: "子任务", value: space.counts.task,  },
      { key: "archived", label: "归档", value: space.counts.archived,  },
    ],

  });
}

export function normalizeInitialTarget(target?: WorkTarget) {
  if (!target || !Number.isFinite(target.targetId) || target.targetId <= 0) return null;
  return target;
}

export function prependActiveTargetId(ids: number[], activeTarget: WorkTarget | null, targetType: WorkTarget["targetType"]) {
  if (!activeTarget || activeTarget.targetType !== targetType) return ids;
  return [activeTarget.targetId, ...ids.filter((id) => id !== activeTarget.targetId)];
}

export function approvalIdFromCurrentUrl() {
  if (typeof window === "undefined") return null;
  const id = Number(new URLSearchParams(window.location.search).get("approvalId"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function createInlineNodeAnchorId(draft: WorkItemDraft, works: WorkItem[]) {
  if (draft.itemType === "objective") return null;
  const parentId = draft.parentWorkItemId;
  if (parentId && works.some((work) => work.id === parentId)) return parentId;
  return null;
}

export function withFormActions(surface: FormSurfaceProps, actions: FormSurfaceActionSpec[]): FormSurfaceProps {
  return { ...surface, actions };
}

export function canMaintainWorkByType(
  work: WorkItem,
  maintenance: WorkPlan["maintenance"] | null | undefined,
) {
  if (!maintenance) return false;
  if (work.itemType === "objective") return maintenance.objective;
  if (work.itemType === "key_result") return maintenance.keyResult;
  return maintenance.task;
}

export function isPlanDraftComplete(draft: Pick<WorkPlan, "kind" | "title" | "okrCycleId" | "periodType" | "plannedStartDate" | "plannedEndDate" | "ownerEmployeeId">) {
  if (draft.kind === "okr") return Boolean(draft.title.trim() && draft.periodType && draft.plannedStartDate && draft.plannedEndDate && draft.ownerEmployeeId);
  if (!draft.title.trim()) return false;
  return true;
}

export function createDefaultNodeDraft(activePlan: WorkPlan, itemType: WorkItemType, rootObjectives: WorkItem[], works: WorkItem[], routineTaskType: RoutineTaskType = "task") {
  const parentObjective = itemType === "objective" ? null : rootObjectives[0] ?? null;
  const isRoutineTask = activePlan.kind === "routine" && itemType === "task";
  return {
    ...createEmptyWorkDraft(nextSortOrder(works), activePlan.id, itemType),
    category: activePlan.kind === "routine" ? "routine" as const : "non-routine" as const,
    routineTaskType: isRoutineTask ? routineTaskType : null,
    ownerEmployeeId: activePlan.targetType === "personal" ? activePlan.ownerEmployeeId : null,
    ownerEmployeeName: activePlan.targetType === "personal" ? activePlan.ownerEmployeeName || "" : "",
    collaborationId: activePlan.collaborationId,
    collaborationTitle: activePlan.collaborationTitle || "",
    parentWorkItemId: parentObjective?.id ?? null,
    parentWorkItemContent: parentObjective ? `目标 · ${parentObjective.content}` : "",
  };
}

export function nextSortOrder(items: Array<{ sortOrder: number }>) {
  if (items.length === 0) return 10;
  return Math.max(...items.map((item) => item.sortOrder || 0)) + 10;
}

export async function listReadableWorkPlans(
  spaces: WorkTaskSpace[],
  activeTarget: WorkTarget | null,
): Promise<{ plans: WorkPlan[]; error: Error | null }> {
  const results = await Promise.allSettled(spaces.map(async (space) => ({
    plans: await listWorkPlans(space),
    space,
  })));
  const failures = results.flatMap((result, index) => result.status === "rejected"
    ? [{ reason: result.reason, space: spaces[index] }]
    : []);
  const activeFailure = failures.find((failure) => sameTarget(failure.space, activeTarget));
  const reason = activeFailure?.reason ?? (failures.length === results.length ? failures[0]?.reason : null);
  return {
    plans: results.flatMap((result) => result.status === "fulfilled" ? result.value.plans : []),
    error: reason instanceof Error ? reason : reason ? new Error("加载工作计划失败") : null,
  };
}
