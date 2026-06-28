import type { ProjectPlanItem, ProjectPlanPhaseItem } from "./plan-gantt-model";
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
