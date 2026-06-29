"use client";

import { forwardRef, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEventHandler, type ReactNode } from "react";
import { buildGanttTicks, datePercent, normalizeDate, parseGanttDate, periodStartFromDate, rangeEnd } from "./VisualizationGanttUtils";
import type { VisualizationGanttBarTone, VisualizationGanttDependencySpec, VisualizationGanttRowSpec, VisualizationGanttSpec } from "./VisualizationGanttTypes";

type DependencyLine = {
  key: string;
  fromKey: string;
  toKey: string;
  x1: number;
  midX: number;
  x2: number;
  y1: number;
  y2: number;
};

type PositionedProps = {
  className?: string;
  leftPercent?: number;
  widthPercent?: number;
  leftPx?: number;
  topPx?: number;
  widthPx?: number;
  heightPx?: number;
  backgroundImage?: string;
  title?: string;
  onMouseEnter?: MouseEventHandler;
  onMouseLeave?: MouseEventHandler;
  children?: ReactNode;
};

const LEFT_COLUMN_WIDTH = 360;
const ROW_GRID = "grid-cols-[360px_minmax(0,1fr)]";
const ACTUAL_ON_TRACK_CLASS = "work-gantt-actual-on-track";
const ACTUAL_DELAYED_CLASS = "work-gantt-actual-delayed";
const BASELINE_BAR_CLASS = "work-gantt-baseline-bar bg-slate-400/75 ring-1 ring-slate-500/15";

export default function VisualizationGantt({ spec }: { spec: VisualizationGanttSpec }) {
  const [hoveredTaskKey, setHoveredTaskKey] = useState<string | null>(null);
  const timelineBodyRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef(new Map<string, HTMLSpanElement>());
  const [dependencyLines, setDependencyLines] = useState<DependencyLine[]>([]);
  const rows = spec.rows;
  const periodStart = normalizeDate(spec.periodStart) ?? periodStartFromDate(new Date(), spec.zoom);
  const periodEnd = rangeEnd(periodStart, spec.zoom);
  const ticks = buildGanttTicks(periodStart, spec.zoom);
  const today = new Date();
  const todayVisible = today >= periodStart && today <= periodEnd;
  const todayLeft = datePercent(today, periodStart, periodEnd);
  const dependencies = useMemo(() => spec.dependencies ?? [], [spec.dependencies]);
  const relatedTaskKeys = buildRelatedTaskKeys(dependencies, hoveredTaskKey);

  useLayoutEffect(() => {
    if (!dependencies.length) {
      setDependencyLines([]);
      return undefined;
    }
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
  }, [dependencies, periodStart, spec.zoom]);

  if (rows.length === 0) {
    return <div className="rounded-md border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">{spec.emptyText ?? "暂无数据"}</div>;
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div className={`grid ${ROW_GRID} border-b border-slate-100 bg-slate-50 text-sm font-semibold text-slate-500`}>
        <div className="px-4 py-3">{spec.leftHeader ?? "名称"}</div>
        <div className="relative min-w-0 overflow-hidden px-4 py-3">
          <div className="relative h-6">
            {ticks.map((tick) => (
              <PositionedSpan
                key={tick.key}
                className="absolute top-0 -translate-x-px whitespace-nowrap border-l border-slate-200 pl-2"
                leftPercent={datePercent(tick.date, periodStart, periodEnd)}
              >
                {tick.label}
              </PositionedSpan>
            ))}
          </div>
        </div>
      </div>

      <div ref={timelineBodyRef} className="relative">
        {todayVisible && (
          <PositionedDiv className="pointer-events-none absolute inset-y-0 right-0 z-10 px-4" leftPx={LEFT_COLUMN_WIDTH}>
            <PositionedSpan className="work-gantt-today-line absolute bottom-0 top-0 w-0.5" leftPercent={todayLeft} />
          </PositionedDiv>
        )}
        <DependencyLines lines={dependencyLines} hoveredTaskKey={hoveredTaskKey} />
        {rows.map((row) => {
          const isRelated = row.key === hoveredTaskKey || relatedTaskKeys.has(row.key);
          const rowKind = row.kind ?? "task";
          return (
            <div
              key={row.key}
              className={`grid ${ROW_GRID} ${rowKind === "phase" ? "min-h-10" : "min-h-12"} border-b border-slate-100 last:border-b-0 ${isRelated ? "bg-amber-50/40" : "hover:bg-slate-50/70"}`}
            >
              <div className="min-w-0 px-4 py-2">
                <RowName row={row} highlighted={isRelated} onToggle={spec.onToggle} />
              </div>
              <div className="relative min-w-0 overflow-hidden px-4 py-2">
                <div className="absolute inset-y-0 left-4 right-4">
                  {ticks.map((tick) => (
                    <PositionedSpan
                      key={`${row.key}-${tick.key}`}
                      className="absolute top-0 h-full border-l border-slate-100"
                      leftPercent={datePercent(tick.date, periodStart, periodEnd)}
                    />
                  ))}
                </div>
                <div className="relative z-10 h-8">
                  {hasVisibleActual(row) && <TimelineGuide row={row} />}
                  <BaselineBar row={row} periodStart={periodStart} periodEnd={periodEnd} />
                  {row.segments?.length ? (
                    <SegmentBars row={row} periodStart={periodStart} periodEnd={periodEnd} />
                  ) : (
                    <CurrentBar
                      row={row}
                      periodStart={periodStart}
                      periodEnd={periodEnd}
                      highlighted={isRelated}
                      onTaskHover={setHoveredTaskKey}
                      barRefs={barRefs}
                    />
                  )}
                  <MilestoneMarks row={row} periodStart={periodStart} periodEnd={periodEnd} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RowName({ row, highlighted, onToggle }: { row: VisualizationGanttRowSpec; highlighted: boolean; onToggle?: (key: string) => void }) {
  const hasToggle = Boolean(row.hasChildren && onToggle);
  return (
    <div className={`flex min-w-0 items-center gap-2 ${depthIndentClassName(row.depth ?? 0)}`}>
      <button
        type="button"
        disabled={!hasToggle}
        onClick={() => onToggle?.(row.key)}
        className={`grid size-5 shrink-0 place-items-center rounded border text-xs font-semibold transition ${
          hasToggle
            ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            : "border-slate-200 bg-white text-slate-500"
        }`}
      >
        {row.hasChildren ? (row.expanded ? "⌄" : "›") : row.kind === "task" ? "·" : "⌄"}
      </button>
      <RowTitle row={row} highlighted={highlighted} />
    </div>
  );
}

function RowTitle({ row, highlighted }: { row: VisualizationGanttRowSpec; highlighted: boolean }) {
  const rowKind = row.kind ?? "task";
  const titleClassName = highlighted ? "text-sm font-semibold text-amber-900" : rowKind === "project" ? "text-sm font-semibold text-slate-900" : rowKind === "phase" ? "text-sm font-semibold text-slate-700" : "text-sm font-medium text-slate-600";
  return (
    <div className="flex min-w-0 items-center gap-2" title={row.label}>
      <span className={`min-w-0 truncate ${titleClassName}`}>{row.label}</span>
      {row.ownerNames && row.ownerNames.length > 0 && <span className="shrink-0 rounded bg-yellow-50 px-1.5 py-0.5 text-xs font-medium text-yellow-700">{ownerBadgeText(row.ownerNames)}</span>}
    </div>
  );
}

function BaselineBar({ row, periodStart, periodEnd }: { row: VisualizationGanttRowSpec; periodStart: Date; periodEnd: Date }) {
  const start = parseGanttDate(row.baselineStartDate);
  const end = parseGanttDate(row.baselineEndDate);
  if (!start || !end || end < start) return null;
  const placement = barPlacement(start, end, periodStart, periodEnd);
  if (!placement) return null;
  return (
    <PositionedSpan
      className={`absolute top-[15px] z-0 min-w-3 rounded-md ${barHeightClassName(row)} ${BASELINE_BAR_CLASS}`}
      title={`基线：${row.label}`}
      leftPercent={placement.left}
      widthPercent={placement.width}
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
  row: VisualizationGanttRowSpec;
  periodStart: Date;
  periodEnd: Date;
  highlighted: boolean;
  onTaskHover: (key: string | null) => void;
  barRefs: React.MutableRefObject<Map<string, HTMLSpanElement>>;
}) {
  const start = parseGanttDate(row.startDate || row.aggregateStartDate);
  const end = parseGanttDate(row.endDate || row.aggregateEndDate);
  const single = end || start;
  const rowKind = row.kind ?? "task";

  if (!start || !end) {
    if (!single) return <TimelineHint>未设日期</TimelineHint>;
    const left = datePercent(single, periodStart, periodEnd);
    if (left <= 0 || left >= 100) return <TimelineHint>不在当前视窗</TimelineHint>;
    return (
      <>
        <PositionedSpan
          className={`absolute ${actualCenterTopClassName(row)} z-20 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm shadow-sm ${actualBarClassName(row)}`}
          title={formatDate(single)}
          leftPercent={left}
        />
        <PositionedSpan className="absolute top-[11px] ml-3 whitespace-nowrap text-xs font-medium text-slate-400" leftPercent={left}>
          {end ? "截止" : "开始"}
        </PositionedSpan>
      </>
    );
  }

  if (end < start) return <TimelineHint>日期异常</TimelineHint>;
  const placement = barPlacement(start, end, periodStart, periodEnd);
  if (!placement) return <TimelineHint>不在当前视窗</TimelineHint>;
  return (
    <PositionedSpan
      ref={(node) => { if (node) barRefs.current.set(row.key, node); else barRefs.current.delete(row.key); }}
      className={`absolute top-[15px] z-10 min-w-4 rounded-md transition ${rowKind === "task" ? "cursor-pointer" : ""} ${highlighted ? "ring-2 ring-amber-300/80 brightness-105" : ""} ${barHeightClassName(row)} ${actualBarClassName(row)}`}
      title={`${row.label} ${row.startDate || ""} - ${row.endDate || ""}`}
      leftPercent={placement.left}
      widthPercent={placement.width}
      onMouseEnter={() => { if (rowKind === "task") onTaskHover(row.key); }}
      onMouseLeave={() => { if (rowKind === "task") onTaskHover(null); }}
    />
  );
}

function SegmentBars({ row, periodStart, periodEnd }: { row: VisualizationGanttRowSpec; periodStart: Date; periodEnd: Date }) {
  return (
    <>
      {row.segments?.map((segment) => {
        const start = parseGanttDate(segment.startDate);
        const end = parseGanttDate(segment.endDate);
        if (!start || !end || end < start) return null;
        const placement = barPlacement(start, end, periodStart, periodEnd);
        if (!placement) return null;
        return (
          <PositionedSpan
            key={segment.key}
            className={`absolute top-[15px] z-10 h-2 min-w-3 rounded-md ${segmentToneClassName(segment.tone)}`}
            title={[segment.label, segment.startDate, segment.endDate ? `至 ${segment.endDate}` : null].filter(Boolean).join(" · ")}
            leftPercent={placement.left}
            widthPercent={placement.width}
          />
        );
      })}
    </>
  );
}

function MilestoneMarks({ row, periodStart, periodEnd }: { row: VisualizationGanttRowSpec; periodStart: Date; periodEnd: Date }) {
  const events = [...(row.milestones ?? [])];
  if (row.isMilestone && (row.endDate || row.startDate)) {
    events.push({ key: `${row.key}:milestone`, label: row.label, date: row.endDate || row.startDate });
  }
  return (
    <>
      {events.map((event) => {
        const date = parseGanttDate(event.date);
        if (!date) return null;
        const left = datePercent(date, periodStart, periodEnd);
        if (left <= 0 || left >= 100) return null;
        return (
          <PositionedSpan
            key={event.key}
            className={`work-gantt-milestone absolute ${actualCenterTopClassName(row)} z-20 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-amber-500 bg-amber-300 shadow-sm`}
            title={event.label}
            leftPercent={left}
          />
        );
      })}
    </>
  );
}

function TimelineGuide({ row }: { row: VisualizationGanttRowSpec }) {
  return <span className={`pointer-events-none absolute left-0 right-0 ${actualCenterTopClassName(row)} h-px bg-slate-200/50`} />;
}

function TimelineHint({ children }: { children: string }) {
  return <span className="absolute top-3 max-w-full truncate text-xs font-medium text-slate-400">{children}</span>;
}

function DependencyLines({ lines, hoveredTaskKey }: { lines: DependencyLine[]; hoveredTaskKey: string | null }) {
  if (!lines.length) return null;
  return <div className="pointer-events-none absolute inset-0 z-[5]">{lines.map((line) => <DependencyLine key={line.key} line={line} active={Boolean(hoveredTaskKey && (line.fromKey === hoveredTaskKey || line.toKey === hoveredTaskKey))} />)}</div>;
}

function DependencyLine({ line, active }: { line: DependencyLine; active: boolean }) {
  const color = active ? "rgba(245,158,11,0.9)" : "rgba(100,116,139,0.62)";
  const lineSize = active ? 2 : 1.5;
  const dash = (direction: "right" | "bottom") => `repeating-linear-gradient(to ${direction}, ${color} 0 8px, transparent 8px 18px)`;
  const h = (left: number, right: number, top: number) => <PositionedSpan className="absolute" leftPx={Math.min(left, right)} topPx={top} widthPx={Math.abs(right - left)} heightPx={lineSize} backgroundImage={dash("right")} />;
  const v = <PositionedSpan className="absolute" leftPx={line.midX} topPx={Math.min(line.y1, line.y2)} widthPx={lineSize} heightPx={Math.abs(line.y2 - line.y1)} backgroundImage={dash("bottom")} />;
  return (
    <>
      {h(line.x1, line.midX, line.y1)}
      {v}
      {h(line.midX, line.x2, line.y2)}
    </>
  );
}

function buildMeasuredDependencyLines(dependencies: VisualizationGanttDependencySpec[], barRefs: Map<string, HTMLSpanElement>, bodyRect: DOMRect): DependencyLine[] {
  return dependencies.flatMap(({ key, fromKey, toKey }) => {
    const fromRect = barRefs.get(fromKey)?.getBoundingClientRect();
    const toRect = barRefs.get(toKey)?.getBoundingClientRect();
    if (!fromRect || !toRect) return [];
    const x1 = fromRect.right - bodyRect.left;
    const x2 = toRect.left - bodyRect.left;
    const y1 = fromRect.top + fromRect.height / 2 - bodyRect.top;
    const y2 = toRect.top + toRect.height / 2 - bodyRect.top;
    const midX = x2 >= x1 ? x1 + Math.min(16, Math.max(8, (x2 - x1) / 2)) : x1 + 16;
    return [{ key, fromKey, toKey, x1, midX, x2, y1, y2 }];
  });
}

function buildRelatedTaskKeys(dependencies: VisualizationGanttDependencySpec[], hoveredTaskKey: string | null) {
  const keys = new Set<string>();
  if (!hoveredTaskKey) return keys;
  for (const { fromKey, toKey } of dependencies) {
    if (fromKey === hoveredTaskKey) keys.add(toKey);
    if (toKey === hoveredTaskKey) keys.add(fromKey);
  }
  return keys;
}

function positionedStyle({ leftPercent, widthPercent, leftPx, topPx, widthPx, heightPx, backgroundImage }: PositionedProps): CSSProperties {
  return {
    left: leftPercent === undefined ? leftPx : `${leftPercent}%`,
    top: topPx,
    width: widthPercent === undefined ? widthPx : `${widthPercent}%`,
    height: heightPx,
    backgroundImage,
  };
}

function eventProps(props: PositionedProps) {
  return { className: props.className, title: props.title, style: positionedStyle(props), onMouseEnter: props.onMouseEnter, onMouseLeave: props.onMouseLeave };
}

const PositionedSpan = forwardRef<HTMLSpanElement, PositionedProps>(function PositionedSpan(props, ref) {
  return <span ref={ref} {...eventProps(props)}>{props.children}</span>;
});

function PositionedDiv(props: PositionedProps) {
  return <div {...eventProps(props)}>{props.children}</div>;
}

function hasVisibleActual(row: VisualizationGanttRowSpec) {
  return Boolean((row.startDate || row.aggregateStartDate) && (row.endDate || row.aggregateEndDate));
}

function barHeightClassName(row: VisualizationGanttRowSpec) {
  return row.kind === "task" ? "h-3" : "h-2";
}

function actualCenterTopClassName(row: VisualizationGanttRowSpec) {
  return row.kind === "task" ? "top-[21px]" : "top-[19px]";
}

function actualBarClassName(row: VisualizationGanttRowSpec) {
  return isDelayed(row) ? ACTUAL_DELAYED_CLASS : ACTUAL_ON_TRACK_CLASS;
}

function segmentToneClassName(tone: VisualizationGanttBarTone | undefined) {
  if (tone === "emerald") return "bg-emerald-300";
  if (tone === "delayed") return ACTUAL_DELAYED_CLASS;
  if (tone === "slate") return "bg-slate-400";
  return ACTUAL_ON_TRACK_CLASS;
}

function isDelayed(row: VisualizationGanttRowSpec) {
  const baselineEnd = parseGanttDate(row.baselineEndDate);
  if (!baselineEnd) return false;
  const actualEnd = parseGanttDate(row.endDate || row.aggregateEndDate);
  if (actualEnd) return actualEnd > baselineEnd;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > baselineEnd;
}

function depthIndentClassName(depth: number) {
  if (depth <= 0) return "ps-0";
  if (depth === 1) return "ps-5";
  if (depth === 2) return "ps-10";
  if (depth === 3) return "ps-16";
  return "ps-20";
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
  return { left: visibleStart, width: Math.max(1.2, visibleEnd - visibleStart) };
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
