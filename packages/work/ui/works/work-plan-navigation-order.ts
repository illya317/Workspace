import type { WorkPlan } from "./types";

export function comparePlansByTime(left: WorkPlan, right: WorkPlan) {
  return planSortTime(left, "start") - planSortTime(right, "start")
    || planSortTime(left, "end") - planSortTime(right, "end")
    || left.id - right.id;
}

export function compareAnnualPlans(left: WorkPlan, right: WorkPlan) {
  return planSortYear(right) - planSortYear(left)
    || annualPlanOrder(left) - annualPlanOrder(right)
    || comparePlansByTime(left, right);
}

export function isAnnualPlan(plan: WorkPlan) {
  const start = planStartDate(plan);
  const end = planEndDate(plan);
  if (!start || !end || start.year !== end.year) return false;
  if (start.month === 1 && start.day === 1 && end.month === 12 && end.day === 31) return true;
  return Math.floor((end.raw.getTime() - start.raw.getTime()) / 86_400_000) + 1 >= 300;
}

export function isHalfYearPlan(plan: WorkPlan) {
  const start = planStartDate(plan);
  const end = planEndDate(plan);
  if (!start || !end || start.year !== end.year) return false;
  return (start.month === 1 && start.day === 1 && end.month === 6 && end.day === 30)
    || (start.month === 7 && start.day === 1 && end.month === 12 && end.day === 31);
}

export function isQuarterlyPlan(plan: WorkPlan) {
  const start = planStartDate(plan);
  const end = planEndDate(plan);
  if (!start || !end || start.year !== end.year || start.day !== 1) return false;
  return (start.month === 1 && end.month === 3 && end.day === 31)
    || (start.month === 4 && end.month === 6 && end.day === 30)
    || (start.month === 7 && end.month === 9 && end.day === 30)
    || (start.month === 10 && end.month === 12 && end.day === 31);
}

export function isMonthlyPlan(plan: WorkPlan) {
  const start = planStartDate(plan);
  const end = planEndDate(plan);
  if (!start || !end || start.year !== end.year || start.month !== end.month || start.day !== 1) return false;
  return end.day === lastDayOfMonth(start.year, start.month);
}

function annualPlanOrder(plan: WorkPlan) {
  const half = halfYearSequence(plan);
  if (half === 2) return 0;
  if (half === 1) return 1;
  return 2;
}

function planStartDate(plan: WorkPlan) {
  return parsePlanDate(plan.plannedStartDate) ?? parsePlanDate(plan.actualStartDate);
}

function planEndDate(plan: WorkPlan) {
  return parsePlanDate(plan.plannedEndDate) ?? parsePlanDate(plan.actualEndDate);
}

function planSortTime(plan: WorkPlan, edge: "start" | "end") {
  const date = edge === "start" ? planStartDate(plan) : planEndDate(plan);
  return date?.raw.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function planSortYear(plan: WorkPlan) {
  return planStartDate(plan)?.year ?? planEndDate(plan)?.year ?? Number.MAX_SAFE_INTEGER;
}

function halfYearSequence(plan: WorkPlan) {
  if (plan.periodType !== "half_year" && !isHalfYearPlan(plan)) return null;
  const start = planStartDate(plan);
  if (start?.month === 7) return 2;
  if (start?.month === 1) return 1;
  const text = `${plan.okrCycleCode ?? ""} ${plan.okrCycleLabel ?? ""} ${plan.title}`;
  if (/\bH2\b|下半年/.test(text)) return 2;
  if (/\bH1\b|上半年/.test(text)) return 1;
  return 1;
}

function parsePlanDate(value: string | null | undefined) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const raw = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
  if (Number.isNaN(raw.getTime())) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), raw };
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
