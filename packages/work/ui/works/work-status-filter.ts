import type { WorkItem, WorkPlan } from "./types";

export type WorkStatusFilter = "active" | "done" | "archived";

export function matchesWorkStatusFilter(
  work: Pick<WorkItem, "status" | "isArchived">,
  filter: WorkStatusFilter,
) {
  return workStatusCategory(work) === filter;
}

export function matchesWorkPlanStatusFilter(
  plan: Pick<WorkPlan, "status" | "isArchived">,
  filter: WorkStatusFilter,
) {
  return workPlanStatusCategory(plan) === filter;
}

export function workStatusCategory(
  work: Pick<WorkItem, "status" | "isArchived">,
): WorkStatusFilter {
  if (work.isArchived) return "archived";
  if (work.status === "done") return "done";
  return "active";
}

export function workPlanStatusCategory(
  plan: Pick<WorkPlan, "status" | "isArchived">,
): WorkStatusFilter {
  if (plan.isArchived) return "archived";
  if (plan.status === "done") return "done";
  return "active";
}
