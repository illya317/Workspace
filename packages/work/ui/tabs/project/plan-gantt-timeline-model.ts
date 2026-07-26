import type { ProjectPlanItem, ProjectPlanPhaseItem } from "./plan-gantt-model";
import { itemKey } from "./plan-gantt-schedule";

export type TimelineRow = {
  key: string;
  kind: ProjectPlanItem["kind"] | "phase";
  id: number;
  name: string;
  depth: number;
  actualStartDate: string | null;
  actualEndDate: string | null;
  status?: string | null;
  isMilestone?: boolean;
  ownerNames?: string[];
  phaseId?: number | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
};

export function buildTimelineRows(items: ProjectPlanItem[], phases: ProjectPlanPhaseItem[]): TimelineRow[] {
  const root = items.find((item) => item.kind === "project");
  const rest = items.filter((item) => item.kind !== "project");
  const rows: TimelineRow[] = [];

  if (root) {
    const projectActual = aggregateActualRange(rest);
    rows.push({
      ...toRow(root, 0),
      actualStartDate: projectActual.actualStartDate ?? root.actualStartDate,
      actualEndDate: projectActual.actualEndDate ?? root.actualEndDate,
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
      actualStartDate: actual.actualStartDate,
      actualEndDate: actual.actualEndDate,
      plannedStartDate: phase.plannedStartDate,
      plannedEndDate: phase.plannedEndDate,
    });
    for (const item of children) rows.push(toRow(item, 1));
  }

  for (const item of rest.filter((candidate) => !candidate.phaseId || !phaseIds.has(candidate.phaseId))) {
    rows.push(toRow(item, 1));
  }

  return rows;
}

function aggregateActualRange(items: ProjectPlanItem[]) {
  const starts = items.map((item) => item.actualStartDate).filter((value): value is string => Boolean(value));
  const ends = items.map((item) => item.actualEndDate).filter((value): value is string => Boolean(value));
  starts.sort();
  ends.sort();
  return { actualStartDate: starts[0] ?? null, actualEndDate: ends[ends.length - 1] ?? null };
}

function toRow(item: ProjectPlanItem, depth: number): TimelineRow {
  return { ...item, key: itemKey(item), depth };
}
