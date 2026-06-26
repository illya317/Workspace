"use client";
/* eslint-disable max-lines */
import { useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { FormSurface } from "@workspace/core/ui";
import type {
  PlanItemKind,
  ProjectPlanDependency,
  ProjectPlanItem,
  ProjectPlanPhaseItem,
} from "./plan-gantt-model";
import { itemKey, parsePlanDate } from "./plan-gantt-schedule";
import type { ProjectGanttZoom } from "./gantt-model";
import { buildGanttTicks, datePercent, rangeEnd } from "./gantt-time";

const LEFT_COLUMN_WIDTH = 360;
const ROW_GRID = "grid-cols-[360px_minmax(0,1fr)]";
const ACTUAL_ON_TRACK_CLASS = "bg-[#00b8a6] shadow-[0_2px_5px_rgba(0,150,136,0.22)]";
const ACTUAL_DELAYED_CLASS = "bg-[#e56b6f] shadow-[0_2px_5px_rgba(210,72,80,0.22)]";
const BASELINE_BAR_CLASS = "bg-slate-400/75 ring-1 ring-slate-500/15 shadow-[0_1px_3px_rgba(71,85,105,0.18)]";
export default function ProjectPlanGanttTimeline({
  items,
  phases,
  dependencies,
  periodStart,
  zoom,
}: {
  items: ProjectPlanItem[];
  phases: ProjectPlanPhaseItem[];
  dependencies: ProjectPlanDependency[];
  periodStart: Date;
  zoom: ProjectGanttZoom;
}) {
  const [hoveredTaskKey, setHoveredTaskKey] = useState<string | null>(null);
  const timelineBodyRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef(new Map<string, HTMLSpanElement>());
  const [dependencyLines, setDependencyLines] = useState<DependencyLine[]>([]);
  const rows = buildRows(items, phases);
  const taskMilestones = rows.filter((row) => row.kind === "task" && row.isMilestone);
  const relatedTaskKeys = buildRelatedTaskKeys(dependencies, hoveredTaskKey);
  const ticks = buildGanttTicks(periodStart, zoom);
  const periodEnd = rangeEnd(periodStart, zoom);
  const today = new Date();
  const todayVisible = today >= periodStart && today <= periodEnd;
  const todayLeft = datePercent(today, periodStart, periodEnd);

  useLayoutEffect(() => {
    const compute = () => {
      const body = timelineBodyRef.current;
      if (body) setDependencyLines(buildMeasuredDependencyLines(dependencies, barRefs.current, body.getBoundingClientRect()));
    };
    compute();
    const observer = new ResizeObserver(compute);
    if (timelineBodyRef.current) observer.observe(timelineBodyRef.current);
    window.addEventListener("resize", compute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [items, phases, dependencies, periodStart, zoom]);

  return (
    <FormSurface
      kind="fields"
      fields={[{
        kind: "section",
        key: "project-gantt",
        title: "项目甘特",
        bodyClassName: "min-w-0 overflow-hidden p-0",
        fields: [{
          kind: "note",
          key: "timeline-body",
          content: rows.length === 0 ? "暂无计划节点" : (
            <div className="min-w-0 max-w-full overflow-hidden">
          <div className={`grid ${ROW_GRID} border-b border-slate-100 bg-slate-50 text-sm font-semibold text-slate-500`}>
            <div className="px-4 py-3">项目 / 任务</div>
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
          <div ref={timelineBodyRef} className="relative">
            {todayVisible && (
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 px-4" style={{ left: LEFT_COLUMN_WIDTH }}>
                <span
                  className="absolute bottom-0 top-0 w-0.5"
                  style={{
                    left: `${todayLeft}%`,
                    backgroundImage: "repeating-linear-gradient(to bottom, rgba(100,116,139,0.6) 0 10px, transparent 10px 22px)",
                  }}
                />
              </div>
            )}
            <DependencyLines lines={dependencyLines} hoveredTaskKey={hoveredTaskKey} />
            {rows.map((row) => {
              const isRelated = row.key === hoveredTaskKey || relatedTaskKeys.has(row.key);
              return (
              <div key={row.key} className={`grid ${ROW_GRID} ${row.kind === "phase" ? "min-h-[42px]" : "min-h-[48px]"} border-b border-slate-100 last:border-b-0 ${isRelated ? "bg-amber-50/40" : "hover:bg-slate-50/70"}`}>
                <div className="min-w-0 px-4 py-2">
                  <RowName row={row} highlighted={isRelated} />
                </div>
                <div className="relative min-w-0 overflow-hidden px-4 py-2">
                  <div className="absolute inset-y-0 left-4 right-4">
                    {ticks.map((tick) => (
                      <span
                        key={`${row.key}-${tick.key}`}
                        className="absolute top-0 h-full border-l border-slate-100"
                        style={{ left: `${datePercent(tick.date, periodStart, periodEnd)}%` }}
                      />
                    ))}
                  </div>
                  <div className="relative z-10 h-8">
                    {hasVisibleActual(row) && <TimelineGuide row={row} />}
                    {row.kind !== "phase" && (
                      <>
                        <BaselineBar row={row} periodStart={periodStart} periodEnd={periodEnd} />
                        <CurrentBar row={row} periodStart={periodStart} periodEnd={periodEnd} highlighted={isRelated} onTaskHover={setHoveredTaskKey} barRefs={barRefs} />
                        {row.kind === "project" && (
                          <ProjectMilestoneMarks
                            milestones={taskMilestones}
                            periodStart={periodStart}
                            periodEnd={periodEnd}
                            topClassName={actualCenterTopClassName(row)}
                          />
                        )}
                      </>
                    )}
                    {row.kind === "phase" && <PhaseBars row={row} periodStart={periodStart} periodEnd={periodEnd} />}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
          ),
        }],
      }]}
    />
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
  baselineStartDate?: string | null;
  baselineEndDate?: string | null;
};
type DependencyLine = { key: string; fromKey: string; toKey: string; x1: number; midX: number; x2: number; y1: number; y2: number };
function buildRows(items: ProjectPlanItem[], phases: ProjectPlanPhaseItem[]): TimelineRow[] {
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
  const unassigned = rest.filter((item) => !item.phaseId || !phases.some((phase) => phase.id === item.phaseId));
  for (const item of unassigned) rows.push(toRow(item, 1));
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
function buildMeasuredDependencyLines(dependencies: ProjectPlanDependency[], barRefs: Map<string, HTMLSpanElement>, bodyRect: DOMRect): DependencyLine[] {
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
    return [{ key: `${predecessorKind}:${predecessorId}-${successorKind}:${successorId}`, fromKey: `${predecessorKind}:${predecessorId}`, toKey: `${successorKind}:${successorId}`, x1, midX, x2, y1, y2 }];
  });
}

function buildRelatedTaskKeys(dependencies: ProjectPlanDependency[], hoveredTaskKey: string | null) {
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

function DependencyLines({ lines, hoveredTaskKey }: { lines: DependencyLine[]; hoveredTaskKey: string | null }) {
  if (!lines.length) return null;
  return <div className="pointer-events-none absolute inset-0 z-[5]">{lines.map((line) => <DependencyLine key={line.key} line={line} active={Boolean(hoveredTaskKey && (line.fromKey === hoveredTaskKey || line.toKey === hoveredTaskKey))} />)}</div>;
}

function DependencyLine({ line, active }: { line: DependencyLine; active: boolean }) {
  const color = active ? "rgba(245,158,11,0.9)" : "rgba(100,116,139,0.62)";
  const lineSize = active ? 2 : 1.5;
  const dash = (direction: "right" | "bottom") => `repeating-linear-gradient(to ${direction}, ${color} 0 8px, transparent 8px 18px)`;
  const h = (left: number, right: number, top: number) => <span className="absolute" style={{ left: Math.min(left, right), top, width: Math.abs(right - left), height: lineSize, backgroundImage: dash("right") }} />;
  const v = <span className="absolute" style={{ left: line.midX, top: Math.min(line.y1, line.y2), width: lineSize, height: Math.abs(line.y2 - line.y1), backgroundImage: dash("bottom") }} />;
  return (
    <>
      {h(line.x1, line.midX, line.y1)}
      {v}
      {h(line.midX, line.x2, line.y2)}
    </>
  );
}

function RowName({ row, highlighted }: { row: TimelineRow; highlighted: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${row.depth * 18}px` }}>
      <span className="grid size-5 shrink-0 place-items-center rounded border border-slate-200 bg-white text-xs font-semibold text-slate-500">
        {row.kind === "task" ? "·" : "⌄"}
      </span>
      <RowTitle row={row} highlighted={highlighted} />
    </div>
  );
}

function RowTitle({ row, highlighted }: { row: TimelineRow; highlighted: boolean }) {
  const titleClassName = highlighted ? "text-sm font-semibold text-amber-900" : row.kind === "project" ? "text-sm font-semibold text-slate-900" : row.kind === "phase" ? "text-sm font-semibold text-slate-700" : "text-sm font-medium text-slate-600";
  return (
    <div className="flex min-w-0 items-center gap-2" title={row.name}>
      <span className={`min-w-0 truncate ${titleClassName}`}>{row.name}</span>
      {row.ownerNames && row.ownerNames.length > 0 && <span className="shrink-0 rounded bg-yellow-50 px-1.5 py-0.5 text-xs font-medium text-yellow-700">{ownerBadgeText(row.ownerNames)}</span>}
    </div>
  );
}

function BaselineBar({
  row,
  periodStart,
  periodEnd,
}: {
  row: TimelineRow;
  periodStart: Date;
  periodEnd: Date;
}) {
  const start = parsePlanDate(row.baselineStartDate);
  const end = parsePlanDate(row.baselineEndDate);
  if (!start || !end || end < start) return null;
  const placement = barPlacement(start, end, periodStart, periodEnd);
  if (!placement) return null;
  return (
    <span
      className={`absolute top-[15px] z-0 min-w-3 rounded-md ${actualBarHeightClassName(row)} ${BASELINE_BAR_CLASS}`}
      title={`基线：${row.name}`}
      style={placement}
    />
  );
}

function CurrentBar({
  row,
  periodStart,
  periodEnd,
  highlighted,
  onTaskHover,
  barRefs,
}: {
  row: TimelineRow;
  periodStart: Date;
  periodEnd: Date;
  highlighted: boolean;
  onTaskHover: (key: string | null) => void;
  barRefs: MutableRefObject<Map<string, HTMLSpanElement>>;
}) {
  const start = parsePlanDate(row.startDate);
  const end = parsePlanDate(row.endDate);
  if (!start || !end || end < start) return <span className="absolute top-3 text-xs font-medium text-slate-400">未设日期</span>;
  const placement = barPlacement(start, end, periodStart, periodEnd);
  if (!placement) return <span className="absolute top-3 text-xs font-medium text-slate-400">不在当前视窗</span>;
  const colorClass = actualBarClassName(row);
  return (
    <>
      <span
        ref={(node) => { if (node) barRefs.current.set(row.key, node); else barRefs.current.delete(row.key); }}
        className={`absolute top-[15px] z-10 rounded-md transition ${row.kind === "task" ? "cursor-pointer" : ""} ${highlighted ? "ring-2 ring-amber-300/80 brightness-105" : ""} ${actualBarHeightClassName(row)} ${colorClass}`}
        title={`${row.name} ${row.startDate || ""} - ${row.endDate || ""}`}
        style={placement}
        onMouseEnter={() => { if (row.kind === "task") onTaskHover(row.key); }}
        onMouseLeave={() => { if (row.kind === "task") onTaskHover(null); }}
      />
      {row.isMilestone && (
        <MilestoneMark
          date={row.endDate || row.startDate}
          label={row.name}
          periodStart={periodStart}
          periodEnd={periodEnd}
          topClassName={actualCenterTopClassName(row)}
        />
      )}
    </>
  );
}

function PhaseBars({ row, periodStart, periodEnd }: { row: TimelineRow; periodStart: Date; periodEnd: Date }) {
  return (
    <>
      <BaselineBar row={row} periodStart={periodStart} periodEnd={periodEnd} />
      <PhaseActualBar row={row} periodStart={periodStart} periodEnd={periodEnd} />
    </>
  );
}

function PhaseActualBar({ row, periodStart, periodEnd }: { row: TimelineRow; periodStart: Date; periodEnd: Date }) {
  const start = parsePlanDate(row.startDate);
  const end = parsePlanDate(row.endDate);
  if (!start || !end || end < start) return null;
  const placement = barPlacement(start, end, periodStart, periodEnd);
  if (!placement) return null;
  return (
    <>
      <span
        className={`absolute top-[15px] z-10 rounded-md ${actualBarHeightClassName(row)} ${actualBarClassName(row)}`}
        title={`阶段实际：${row.name} ${row.startDate || ""} - ${row.endDate || ""}`}
        style={placement}
      />
    </>
  );
}

function ProjectMilestoneMarks({
  milestones,
  periodStart,
  periodEnd,
  topClassName,
}: {
  milestones: TimelineRow[];
  periodStart: Date;
  periodEnd: Date;
  topClassName: string;
}) {
  return milestones.map((milestone) => (
    <MilestoneMark
      key={`project-milestone:${milestone.key}`}
      date={milestone.endDate || milestone.startDate}
      label={milestone.name}
      periodStart={periodStart}
      periodEnd={periodEnd}
      topClassName={topClassName}
    />
  ));
}

function TimelineGuide({ row }: { row: TimelineRow }) {
  return <span className={`pointer-events-none absolute left-0 right-0 ${actualCenterTopClassName(row)} h-px bg-slate-200/50`} />;
}

function hasVisibleActual(row: TimelineRow) {
  return Boolean(row.startDate && row.endDate);
}

function actualCenterTopClassName(row: TimelineRow) {
  return row.kind === "task" ? "top-[21px]" : "top-[19px]";
}

function actualBarHeightClassName(row: TimelineRow) {
  return row.kind === "task" ? "h-3" : "h-2";
}

function actualBarClassName(row: TimelineRow) {
  return isDelayed(row) ? ACTUAL_DELAYED_CLASS : ACTUAL_ON_TRACK_CLASS;
}

function isDelayed(row: TimelineRow) {
  const baselineEnd = parsePlanDate(row.baselineEndDate);
  if (!baselineEnd) return false;
  const actualEnd = parsePlanDate(row.endDate);
  if (actualEnd) return actualEnd > baselineEnd;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > baselineEnd;
}

function MilestoneMark({
  date,
  label,
  periodStart,
  periodEnd,
  topClassName = "top-[21px]",
}: {
  date?: string | null;
  label: string;
  periodStart: Date;
  periodEnd: Date;
  topClassName?: string;
}) {
  const value = parsePlanDate(date);
  if (!value) return null;
  const left = datePercent(value, periodStart, periodEnd);
  if (left <= 0 || left >= 100) return null;
  return (
    <span
      className={`absolute ${topClassName} z-20 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border border-amber-500 bg-amber-300 shadow-sm`}
      title={label}
      style={{ left: `${left}%` }}
    />
  );
}

function ownerBadgeText(names: string[]) {
  if (names.length <= 2) return names.join("、");
  return `${names.slice(0, 2).join("、")} 等${names.length}人`;
}

function barPlacement(start: Date, end: Date, periodStart: Date, periodEnd: Date) {
  const left = datePercent(start, periodStart, periodEnd);
  const right = datePercent(end, periodStart, periodEnd);
  const visibleStart = Math.max(0, Math.min(left, right));
  const visibleEnd = Math.min(100, Math.max(left, right));
  if (visibleEnd <= 0 || visibleStart >= 100) return null;
  return { left: `${visibleStart}%`, width: `${Math.max(1.2, visibleEnd - visibleStart)}%` };
}
