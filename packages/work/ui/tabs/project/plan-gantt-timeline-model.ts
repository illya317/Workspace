import type { ProjectPlanDependency, ProjectPlanItem, ProjectPlanPhaseItem } from "./plan-gantt-model";
import { itemKey } from "./plan-gantt-schedule";

export type TimelineRow = {
  key: string;
  kind: ProjectPlanItem["kind"] | "phase";
  id: number;
  name: string;
  depth: number;
  startDate: string | null;
  endDate: string | null;
  status?: string | null;
  isMilestone?: boolean;
  ownerNames?: string[];
  phaseId?: number | null;
  baselineStartDate?: string | null;
  baselineEndDate?: string | null;
};

export type DependencyLine = {
  key: string;
  fromKey: string;
  toKey: string;
  x1: number;
  midX: number;
  x2: number;
  y1: number;
  y2: number;
};

export function buildTimelineRows(items: ProjectPlanItem[], phases: ProjectPlanPhaseItem[]): TimelineRow[] {
  const root = items.find((item) => item.kind === "project");
  const rest = items.filter((item) => item.kind !== "project");
  const rows: TimelineRow[] = [];

  if (root) {
    const projectActual = aggregateActualRange(rest);
    rows.push({
      ...toRow(root, 0),
      startDate: projectActual.startDate ?? root.startDate,
      endDate: projectActual.endDate ?? root.endDate,
    });
  }

  const phaseIds = new Set(phases.map((phase) => phase.id));
  for (const phase of phases) {
    const children = rest.filter((item) => item.phaseId === phase.id);
    if (children.length === 0) continue;
    const actual = aggregateActualRange(children);
    rows.push({
      key: `phase:${phase.id}`,
      kind: "phase",
      id: phase.id,
      name: phase.name,
      depth: 0,
      startDate: actual.startDate,
      endDate: actual.endDate,
      baselineStartDate: phase.startDate,
      baselineEndDate: phase.endDate,
    });
    for (const item of children) rows.push(toRow(item, 1));
  }

  for (const item of rest.filter((candidate) => !candidate.phaseId || !phaseIds.has(candidate.phaseId))) {
    rows.push(toRow(item, 1));
  }

  return rows;
}

export function buildMeasuredDependencyLines(
  dependencies: ProjectPlanDependency[],
  barRefs: Map<string, HTMLSpanElement>,
  bodyRect: DOMRect,
): DependencyLine[] {
  return dependencies.flatMap(({ predecessorKind, predecessorId, successorKind, successorId }) => {
    if (predecessorKind !== "task" || successorKind !== "task") return [];
    const fromKey = `${predecessorKind}:${predecessorId}`;
    const toKey = `${successorKind}:${successorId}`;
    const fromRect = barRefs.get(fromKey)?.getBoundingClientRect();
    const toRect = barRefs.get(toKey)?.getBoundingClientRect();
    if (!fromRect || !toRect) return [];
    const x1 = fromRect.right - bodyRect.left;
    const x2 = toRect.left - bodyRect.left;
    const y1 = fromRect.top + fromRect.height / 2 - bodyRect.top;
    const y2 = toRect.top + toRect.height / 2 - bodyRect.top;
    const midX = x2 >= x1 ? x1 + Math.min(16, Math.max(8, (x2 - x1) / 2)) : x1 + 16;

    return [{
      key: `${predecessorKind}:${predecessorId}-${successorKind}:${successorId}`,
      fromKey,
      toKey,
      x1,
      midX,
      x2,
      y1,
      y2,
    }];
  });
}

export function buildRelatedTaskKeys(dependencies: ProjectPlanDependency[], hoveredTaskKey: string | null) {
  const keys = new Set<string>();
  if (!hoveredTaskKey) return keys;

  for (const { predecessorKind, predecessorId, successorKind, successorId } of dependencies) {
    const fromKey = `${predecessorKind}:${predecessorId}`;
    const toKey = `${successorKind}:${successorId}`;
    if (fromKey === hoveredTaskKey) keys.add(toKey);
    if (toKey === hoveredTaskKey) keys.add(fromKey);
  }

  return keys;
}

function aggregateActualRange(items: ProjectPlanItem[]) {
  const starts = items.map((item) => item.startDate).filter((value): value is string => Boolean(value));
  const ends = items.map((item) => item.endDate).filter((value): value is string => Boolean(value));
  starts.sort();
  ends.sort();
  return { startDate: starts[0] ?? null, endDate: ends[ends.length - 1] ?? null };
}

function toRow(item: ProjectPlanItem, depth: number): TimelineRow {
  return { ...item, key: itemKey(item), depth };
}
