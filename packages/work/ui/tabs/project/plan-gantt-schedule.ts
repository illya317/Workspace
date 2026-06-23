import type {
  PlanItemKind,
  ProjectPlanBaseline,
  ProjectPlanDependency,
  ProjectPlanItem,
} from "./plan-gantt-model";
import { planItemKey } from "./plan-gantt-model";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parsePlanDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPlanDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function durationDays(start: string | null, end: string | null) {
  const startDate = parsePlanDate(start);
  const endDate = parsePlanDate(end);
  if (!startDate || !endDate || endDate < startDate) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS);
}

export function itemKey(item: Pick<ProjectPlanItem, "kind" | "id">) {
  return planItemKey(item.kind, item.id);
}

export function dependencyKey(dependency: Pick<ProjectPlanDependency, "successorKind" | "successorId">) {
  return planItemKey(dependency.successorKind, dependency.successorId);
}

export function baselineMap(baseline: ProjectPlanBaseline | null) {
  const map = new Map<string, { startDate: string | null; endDate: string | null; name: string }>();
  for (const item of baseline?.items || []) {
    if (item.itemKind === "phase") continue;
    map.set(planItemKey(item.itemKind as PlanItemKind, item.itemId), {
      startDate: item.startDate,
      endDate: item.endDate,
      name: item.name,
    });
  }
  return map;
}

export function cascadePlanDates(
  items: ProjectPlanItem[],
  dependencies: ProjectPlanDependency[],
  changedKey: string,
) {
  const itemByKey = new Map(items.map((item) => [itemKey(item), { ...item }]));
  const successorsByKey = new Map<string, ProjectPlanDependency[]>();
  for (const dependency of dependencies) {
    const key = planItemKey(dependency.predecessorKind, dependency.predecessorId);
    successorsByKey.set(key, [...successorsByKey.get(key) || [], dependency]);
  }

  const queue = [changedKey];
  const visited = new Set<string>();
  while (queue.length) {
    const key = queue.shift();
    if (!key || visited.has(key)) continue;
    visited.add(key);
    const predecessor = itemByKey.get(key);
    const predecessorEnd = parsePlanDate(predecessor?.endDate);
    if (!predecessorEnd) continue;

    for (const dependency of successorsByKey.get(key) || []) {
      const successorKey = planItemKey(dependency.successorKind, dependency.successorId);
      const successor = itemByKey.get(successorKey);
      if (!successor) continue;
      const duration = durationDays(successor.startDate, successor.endDate);
      if (duration === null) continue;
      const nextStart = addDays(predecessorEnd, dependency.lagDays ?? 1);
      successor.startDate = formatPlanDate(nextStart);
      successor.endDate = formatPlanDate(addDays(nextStart, duration));
      itemByKey.set(successorKey, successor);
      queue.push(successorKey);
    }
  }
  return items.map((item) => itemByKey.get(itemKey(item)) || item);
}

export function hasIncompleteDate(item: { startDate: string | null; endDate: string | null }) {
  return Boolean(item.startDate) !== Boolean(item.endDate);
}
