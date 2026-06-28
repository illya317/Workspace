import type { MutableRefObject } from "react";
import { datePercent } from "./gantt-time";
import type { DependencyLine, TimelineRow } from "./plan-gantt-timeline-model";
import { parsePlanDate } from "./plan-gantt-schedule";

const ACTUAL_ON_TRACK_CLASS = "bg-[#00b8a6] shadow-[0_2px_5px_rgba(0,150,136,0.22)]";
const ACTUAL_DELAYED_CLASS = "bg-[#e56b6f] shadow-[0_2px_5px_rgba(210,72,80,0.22)]";
const BASELINE_BAR_CLASS = "bg-slate-400/75 ring-1 ring-slate-500/15 shadow-[0_1px_3px_rgba(71,85,105,0.18)]";

export function DependencyLines({ lines, hoveredTaskKey }: { lines: DependencyLine[]; hoveredTaskKey: string | null }) {
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

export function RowName({ row, highlighted }: { row: TimelineRow; highlighted: boolean }) {
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

export function BaselineBar({
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

export function CurrentBar({
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

export function PhaseBars({ row, periodStart, periodEnd }: { row: TimelineRow; periodStart: Date; periodEnd: Date }) {
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

export function ProjectMilestoneMarks({
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

export function TimelineGuide({ row }: { row: TimelineRow }) {
  return <span className={`pointer-events-none absolute left-0 right-0 ${actualCenterTopClassName(row)} h-px bg-slate-200/50`} />;
}

export function hasVisibleActual(row: TimelineRow) {
  return Boolean(row.startDate && row.endDate);
}

export function actualCenterTopClassName(row: TimelineRow) {
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
