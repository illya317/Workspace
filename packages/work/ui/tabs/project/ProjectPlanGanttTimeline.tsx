"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { WorkPositionedDiv, WorkPositionedSpan } from "../../../rendering/WorkPositioned";
import type {
  ProjectPlanDependency,
  ProjectPlanItem,
  ProjectPlanPhaseItem,
} from "./plan-gantt-model";
import type { ProjectGanttZoom } from "./gantt-model";
import { buildGanttTicks, datePercent, rangeEnd } from "./gantt-time";
import {
  BaselineBar,
  CurrentBar,
  DependencyLines,
  PhaseBars,
  ProjectMilestoneMarks,
  RowName,
  TimelineGuide,
  actualCenterTopClassName,
  hasVisibleActual,
} from "./ProjectPlanGanttTimeline.parts";
import {
  buildMeasuredDependencyLines,
  buildRelatedTaskKeys,
  buildTimelineRows,
  type DependencyLine,
} from "./plan-gantt-timeline-model";

const LEFT_COLUMN_WIDTH = 360;
const ROW_GRID = "grid-cols-[360px_minmax(0,1fr)]";
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
  const rows = buildTimelineRows(items, phases);
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

  if (rows.length === 0) return <div className="rounded-md border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">暂无计划节点</div>;

  return (
    <div className="min-w-0 max-w-full overflow-hidden">
          <div className={`grid ${ROW_GRID} border-b border-slate-100 bg-slate-50 text-sm font-semibold text-slate-500`}>
            <div className="px-4 py-3">项目 / 任务</div>
            <div className="relative min-w-0 overflow-hidden px-4 py-3">
              <div className="relative h-6">
                {ticks.map((tick) => (
                  <WorkPositionedSpan
                    key={tick.key}
                    className="absolute top-0 -translate-x-px whitespace-nowrap border-l border-slate-200 pl-2"
                    leftPercent={datePercent(tick.date, periodStart, periodEnd)}
                  >
                    {tick.label}
                  </WorkPositionedSpan>
                ))}
              </div>
            </div>
          </div>
          <div ref={timelineBodyRef} className="relative">
            {todayVisible && (
              <WorkPositionedDiv className="pointer-events-none absolute inset-y-0 right-0 z-10 px-4" leftPx={LEFT_COLUMN_WIDTH}>
                <WorkPositionedSpan className="work-gantt-today-line absolute bottom-0 top-0 w-0.5" leftPercent={todayLeft} />
              </WorkPositionedDiv>
            )}
            <DependencyLines lines={dependencyLines} hoveredTaskKey={hoveredTaskKey} />
            {rows.map((row) => {
              const isRelated = row.key === hoveredTaskKey || relatedTaskKeys.has(row.key);
              return (
              <div key={row.key} className={`grid ${ROW_GRID} ${row.kind === "phase" ? "min-h-10" : "min-h-12"} border-b border-slate-100 last:border-b-0 ${isRelated ? "bg-amber-50/40" : "hover:bg-slate-50/70"}`}>
                <div className="min-w-0 px-4 py-2">
                  <RowName row={row} highlighted={isRelated} />
                </div>
                <div className="relative min-w-0 overflow-hidden px-4 py-2">
                  <div className="absolute inset-y-0 left-4 right-4">
                    {ticks.map((tick) => (
                      <WorkPositionedSpan
                        key={`${row.key}-${tick.key}`}
                        className="absolute top-0 h-full border-l border-slate-100"
                        leftPercent={datePercent(tick.date, periodStart, periodEnd)}
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
  );
}
