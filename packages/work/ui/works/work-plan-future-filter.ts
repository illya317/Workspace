"use client";

import type { WorkPlan } from "./types";

export type WorkPlanFutureFilter = "1m" | "3m" | "1y" | "all";

export const WORK_PLAN_FUTURE_FILTER_OPTIONS: Array<{ value: WorkPlanFutureFilter; label: string }> = [
  { value: "1m", label: "1个月" },
  { value: "3m", label: "3个月" },
  { value: "1y", label: "1年" },
  { value: "all", label: "全部" },
];

export function planMatchesFutureFilter(
  plan: Pick<WorkPlan, "kind" | "plannedStartDate" | "actualStartDate">,
  filter: WorkPlanFutureFilter,
  today: Date | string = new Date(),
) {
  if (plan.kind === "routine" || filter === "all") return true;
  const startDate = dateKey(plan.plannedStartDate) ?? dateKey(plan.actualStartDate);
  const currentDate = dateKey(today);
  if (!startDate || !currentDate) return true;
  return startDate <= addCalendarMonths(currentDate, filter === "1m" ? 1 : filter === "3m" ? 3 : 12);
}

function addCalendarMonths(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const targetIndex = year * 12 + month - 1 + months;
  const targetYear = Math.floor(targetIndex / 12);
  const targetMonth = targetIndex % 12;
  const targetDay = Math.min(day, new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate());
  return `${targetYear}-${pad2(targetMonth + 1)}-${pad2(targetDay)}`;
}

function dateKey(value: Date | string | null | undefined) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
