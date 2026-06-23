"use client";

import { EmptyStateCard, SectionCard } from "@workspace/core/ui";
import type {
  PlanItemKind,
  ProjectPlanBaseline,
  ProjectPlanItem,
  ProjectPlanPhaseItem,
} from "./plan-gantt-model";
import { baselineMap, itemKey, parsePlanDate } from "./plan-gantt-schedule";
import type { ProjectGanttZoom } from "./gantt-model";
import { buildGanttTicks, datePercent, rangeEnd } from "./gantt-time";

const ROW_GRID = "grid-cols-[260px_minmax(0,1fr)]";
const BAR_CLASS: Record<string, string> = {
  project: "bg-teal-600",
  task: "bg-sky-300",
};

export default function ProjectPlanGanttTimeline({
  items,
  phases,
  baseline,
  periodStart,
  zoom,
}: {
  items: ProjectPlanItem[];
  phases: ProjectPlanPhaseItem[];
  baseline: ProjectPlanBaseline | null;
  periodStart: Date;
  zoom: ProjectGanttZoom;
}) {
  const rows = buildRows(items, phases);
  const baselineByKey = baselineMap(baseline);
  const ticks = buildGanttTicks(periodStart, zoom);
  const periodEnd = rangeEnd(periodStart, zoom);

  return (
    <SectionCard title="项目甘特" bodyClassName="min-w-0 overflow-hidden p-0">
      {rows.length === 0 ? (
        <EmptyStateCard compact={false}>暂无计划节点</EmptyStateCard>
      ) : (
        <div className="min-w-0 max-w-full overflow-hidden">
          <div className={`grid ${ROW_GRID} border-b border-slate-100 bg-slate-50 text-sm font-semibold text-slate-500`}>
            <div className="px-4 py-3">名称</div>
            <div className="relative min-w-0 overflow-hidden px-4 py-3">
              <div className="relative h-6">
                {ticks.map((tick) => (
                  <span
                    key={tick.key}
                    className="absolute top-0 -translate-x-px whitespace-nowrap border-l border-slate-200 pl-2"
                    style={{ left: `${datePercent(tick.date, periodStart, periodEnd)}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {rows.map((row) => (
            <div key={row.key} className={`grid ${ROW_GRID} border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60`}>
              <div className="flex min-w-0 items-center px-4 py-3">
                <RowName row={row} />
              </div>
              <div className="relative min-w-0 overflow-hidden px-4 py-3">
                <div className="absolute inset-y-0 left-4 right-4">
                  {ticks.map((tick) => (
                    <span
                      key={`${row.key}-${tick.key}`}
                      className="absolute top-0 h-full border-l border-slate-100"
                      style={{ left: `${datePercent(tick.date, periodStart, periodEnd)}%` }}
                    />
                  ))}
                </div>
                <div className="relative h-12">
                  {row.kind !== "phase" && (
                    <>
                      <BaselineBar value={baselineByKey.get(row.key)} periodStart={periodStart} periodEnd={periodEnd} />
                      <CurrentBar row={row} periodStart={periodStart} periodEnd={periodEnd} />
                    </>
                  )}
                  {row.kind === "phase" && <PhaseBar row={row} periodStart={periodStart} periodEnd={periodEnd} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

type TimelineRow = {
  key: string;
  kind: PlanItemKind | "phase";
  id: number;
  name: string;
  depth: number;
  startDate: string | null;
  endDate: string | null;
  status?: string | null;
  isMilestone?: boolean;
  ownerNames?: string[];
  phaseId?: number | null;
};

function buildRows(items: ProjectPlanItem[], phases: ProjectPlanPhaseItem[]): TimelineRow[] {
  const root = items.find((item) => item.kind === "project");
  const rest = items.filter((item) => item.kind !== "project");
  const rows: TimelineRow[] = [];
  if (root) rows.push(toRow(root, 0));
  for (const phase of phases) {
    const children = rest.filter((item) => item.phaseId === phase.id);
    rows.push({ key: `phase:${phase.id}`, kind: "phase", id: phase.id, name: phase.name, depth: 0, startDate: phase.startDate, endDate: phase.endDate });
    for (const item of children) rows.push(toRow(item, 1));
  }
  const unassigned = rest.filter((item) => !item.phaseId || !phases.some((phase) => phase.id === item.phaseId));
  if (unassigned.length) {
    rows.push({ key: "phase:unassigned", kind: "phase", id: 0, name: "未分阶段", depth: 0, startDate: null, endDate: null });
    for (const item of unassigned) rows.push(toRow(item, 1));
  }
  return rows;
}

function toRow(item: ProjectPlanItem, depth: number): TimelineRow {
  return { ...item, key: itemKey(item), depth };
}

function RowName({ row }: { row: TimelineRow }) {
  if (row.kind === "phase") return <div className="min-w-0 truncate text-sm font-semibold text-slate-700" title={row.name}>{row.name}</div>;
  return (
    <div
      className="min-w-0 truncate text-sm font-semibold text-slate-900"
      title={row.name}
      style={{ paddingLeft: `${row.depth * 18}px` }}
    >
      {row.name}
    </div>
  );
}

function BaselineBar({
  value,
  periodStart,
  periodEnd,
}: {
  value?: { startDate: string | null; endDate: string | null; name: string };
  periodStart: Date;
  periodEnd: Date;
}) {
  const start = parsePlanDate(value?.startDate);
  const end = parsePlanDate(value?.endDate);
  if (!start || !end || end < start) return null;
  const placement = barPlacement(start, end, periodStart, periodEnd);
  if (!placement) return null;
  return <span className="absolute top-[29px] h-1 rounded-full bg-slate-300" title={`基准：${value?.name || ""}`} style={placement} />;
}

function CurrentBar({ row, periodStart, periodEnd }: { row: TimelineRow; periodStart: Date; periodEnd: Date }) {
  const start = parsePlanDate(row.startDate);
  const end = parsePlanDate(row.endDate);
  if (!start || !end || end < start) return <span className="absolute top-3 text-xs font-medium text-slate-400">未设日期</span>;
  const placement = barPlacement(start, end, periodStart, periodEnd);
  if (!placement) return <span className="absolute top-3 text-xs font-medium text-slate-400">不在当前视窗</span>;
  return (
    <span
      className={`absolute top-[17px] rounded-full shadow-sm ${row.kind === "task" ? "h-2" : "h-3"} ${BAR_CLASS[row.kind] || "bg-slate-400"}`}
      title={`${row.name} ${row.startDate || ""} - ${row.endDate || ""}`}
      style={placement}
    />
  );
}

function PhaseBar({ row, periodStart, periodEnd }: { row: TimelineRow; periodStart: Date; periodEnd: Date }) {
  const start = parsePlanDate(row.startDate);
  const end = parsePlanDate(row.endDate);
  if (!start || !end || end < start) return null;
  const placement = barPlacement(start, end, periodStart, periodEnd);
  if (!placement) return null;
  return <span className="absolute top-[21px] h-1 rounded-full bg-slate-300" style={placement} />;
}

function barPlacement(start: Date, end: Date, periodStart: Date, periodEnd: Date) {
  const left = datePercent(start, periodStart, periodEnd);
  const right = datePercent(end, periodStart, periodEnd);
  const visibleStart = Math.max(0, Math.min(left, right));
  const visibleEnd = Math.min(100, Math.max(left, right));
  if (visibleEnd <= 0 || visibleStart >= 100) return null;
  return { left: `${visibleStart}%`, width: `${Math.max(1.2, visibleEnd - visibleStart)}%` };
}
