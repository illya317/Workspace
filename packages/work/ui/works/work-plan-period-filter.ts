"use client";

import type { WorkPeriodType, WorkPlan } from "./types";

export type WorkPlanPeriodFilter = "all" | WorkPeriodType | "routine";
export type WorkOwnedPeriodType = "yearly" | "half_year" | "quarterly" | "monthly";

export const WORK_PLAN_PERIOD_FILTER_OPTIONS: Array<{ value: WorkPlanPeriodFilter; label: string }> = [
  { value: "routine", label: "日常" },
  { value: "monthly", label: "月" },
  { value: "quarterly", label: "季度" },
  { value: "yearly", label: "年" },
];

export const WORK_OWNED_PERIOD_OPTIONS: Array<{ value: WorkOwnedPeriodType; label: string }> = WORK_PLAN_PERIOD_FILTER_OPTIONS
  .filter((option): option is { value: WorkOwnedPeriodType; label: string } => ownedPeriodTypeForFilter(option.value) != null);

export function planMatchesPeriodFilter(plan: WorkPlan, filter: WorkPlanPeriodFilter) {
  if (filter === "all") return true;
  if (filter === "routine") return plan.kind === "routine" || (plan.kind === "okr" && !ownedPeriodTypeForFilter(plan.periodType));
  if (filter === "yearly") return plan.kind === "okr" && (plan.periodType === "yearly" || plan.periodType === "half_year");
  return plan.kind === "okr" && plan.periodType === filter;
}

export function ownedPeriodTypeForFilter(filter: WorkPlanPeriodFilter | null | undefined): WorkOwnedPeriodType | null {
  if (filter === "yearly" || filter === "half_year" || filter === "quarterly" || filter === "monthly") return filter;
  return null;
}

export function ownedPeriodLabel(periodType: WorkOwnedPeriodType | null | undefined) {
  return WORK_PLAN_PERIOD_FILTER_OPTIONS.find((option) => option.value === periodType)?.label ?? "";
}
