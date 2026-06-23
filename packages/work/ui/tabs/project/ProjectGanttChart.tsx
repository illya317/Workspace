"use client";

import { EmptyStateCard, SectionCard } from "@workspace/core/ui";
import {
  type GanttMilestoneEvent,
  type GanttRow,
  type ProjectGanttStageSegment,
  type ProjectGanttZoom,
} from "./gantt-model";
import { buildGanttTicks, datePercent, parseGanttDate, rangeEnd } from "./gantt-time";

const ROW_GRID = "grid-cols-[280px_minmax(0,1fr)]";
const STATUS_BAR_CLASS: Record<string, string> = {
  "进行中": "bg-teal-600",
  "已完成": "bg-green-600",
  "已终止": "bg-rose-600",
};
const STAGE_BAR_CLASS: Record<string, string> = {
  "规划中": "bg-emerald-300",
  "进行中": "bg-teal-500",
  "暂停": "bg-red-200",
  "已完成": "bg-green-600",
  "已终止": "bg-rose-600",
};

export default function ProjectGanttChart({
  rows,
  periodStart,
  zoom,
  onToggle,
}: {
  rows: GanttRow[];
  periodStart: Date;
  zoom: ProjectGanttZoom;
  onToggle: (key: string) => void;
}) {
  const ticks = buildGanttTicks(periodStart, zoom);
  const periodEnd = rangeEnd(periodStart, zoom);
  const today = new Date();
  const todayVisible = today >= periodStart && today <= periodEnd;
  const todayLeft = datePercent(today, periodStart, periodEnd);

  return (
    <SectionCard title="公司甘特" bodyClassName="min-w-0 overflow-hidden p-0">
      {rows.length === 0 ? (
        <EmptyStateCard compact={false}>暂无匹配项目</EmptyStateCard>
      ) : (
        <div className="min-w-0 max-w-full overflow-hidden">
          <div className="min-w-0 max-w-full">
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

            <div className="relative">
              {todayVisible && (
                <div className="pointer-events-none absolute inset-y-0 left-[280px] right-0 z-10 px-4">
                  <span
                    className="absolute bottom-0 top-0 w-0.5"
                    style={{
                      left: `${todayLeft}%`,
                      backgroundImage: "repeating-linear-gradient(to bottom, rgba(100,116,139,0.62) 0 10px, transparent 10px 22px)",
                    }}
                  />
                </div>
              )}

              {rows.map((row) => (
                <div
                  key={row.key}
                  className={`relative grid ${ROW_GRID} border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70`}
                >
                  <div className="min-w-0 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${row.depth * 18}px` }}>
                      <button
                        type="button"
                        disabled={!row.hasChildren}
                        onClick={() => onToggle(row.key)}
                        className={`grid size-6 shrink-0 place-items-center rounded-md text-sm font-semibold transition ${
                          row.hasChildren
                            ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            : "text-transparent"
                        }`}
                      >
                        {row.hasChildren ? (row.expanded ? "⌄" : "›") : "·"}
                      </button>
                      <div className="min-w-0">
                        <RowTitle row={row} />
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {row.status && <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusBadgeClassName(row.status)}`}>{row.status}</span>}
                          {row.ownerNames.length > 0 && <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-xs font-medium text-yellow-700">{ownerBadgeText(row.ownerNames)}</span>}
                        </div>
                      </div>
                    </div>
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
                    <div className="relative h-11">
                      <BaselineMark row={row} periodStart={periodStart} periodEnd={periodEnd} />
                      <TimelineMark row={row} periodStart={periodStart} periodEnd={periodEnd} />
                      {row.kind !== "task" && row.milestoneEvents.length > 0 && (
                        <MilestoneMarks events={row.milestoneEvents} periodStart={periodStart} periodEnd={periodEnd} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function BaselineMark({ row, periodStart, periodEnd }: { row: GanttRow; periodStart: Date; periodEnd: Date }) {
  const start = parseGanttDate(row.baselineStartDate);
  const end = parseGanttDate(row.baselineEndDate);
  if (!start || !end || end < start) return null;
  const left = datePercent(start, periodStart, periodEnd);
  const right = datePercent(end, periodStart, periodEnd);
  const visibleStart = Math.max(0, Math.min(left, right));
  const visibleEnd = Math.min(100, Math.max(left, right));
  if (visibleEnd <= 0 || visibleStart >= 100) return null;
  return (
    <span
      className="absolute top-[29px] h-1 min-w-3 rounded-full bg-slate-300"
      title={`基准 ${formatDate(start)} - ${formatDate(end)}`}
      style={{ left: `${visibleStart}%`, width: `${Math.max(1.2, visibleEnd - visibleStart)}%` }}
    />
  );
}

function RowTitle({ row }: { row: GanttRow }) {
  if (row.kind === "task") {
    return (
      <div className="flex min-w-0 items-center gap-1.5" title={row.name}>
        <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-sky-700">任务</span>
        <span className="min-w-0 truncate text-sm font-medium text-slate-600">{row.name}</span>
      </div>
    );
  }
  return (
    <div className="truncate text-sm font-semibold text-slate-900" title={row.name}>
      {row.name}
    </div>
  );
}

function TimelineMark({ row, periodStart, periodEnd }: { row: GanttRow; periodStart: Date; periodEnd: Date }) {
  const start = parseGanttDate(row.startDate || row.aggregateStart);
  const end = parseGanttDate(row.endDate || row.aggregateEnd);
  const colorClass = barClassName(row);

  if (row.kind === "project" && row.stages.length > 0) {
    return <StageTimeline stages={row.stages} periodStart={periodStart} periodEnd={periodEnd} fallbackStart={start} fallbackEnd={end} />;
  }

  if (start && end) {
    if (end < start) return <TimelineHint>日期异常</TimelineHint>;

    const left = datePercent(start, periodStart, periodEnd);
    const right = datePercent(end, periodStart, periodEnd);
    const visibleStart = Math.max(0, Math.min(left, right));
    const visibleEnd = Math.min(100, Math.max(left, right));
    if (visibleEnd <= 0 || visibleStart >= 100) return <TimelineHint>不在当前视窗</TimelineHint>;
    return (
      <>
        <span className="absolute left-0 right-0 top-[21px] h-px bg-slate-200/70" />
        <div
          className={`absolute top-[15px] min-w-4 rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.12)] ${row.kind === "task" ? "h-2" : "h-3"} ${colorClass}`}
          title={`${formatDate(start)} - ${formatDate(end)}`}
          style={{ left: `${visibleStart}%`, width: `${Math.max(1.5, visibleEnd - visibleStart)}%` }}
        />
      </>
    );
  }

  const single = end || start;
  if (!single) return <TimelineHint>未设日期</TimelineHint>;
  const left = datePercent(single, periodStart, periodEnd);
  if (left <= 0 || left >= 100) return <TimelineHint>不在当前视窗</TimelineHint>;
  return (
    <>
      <span
        className={`absolute top-[16px] size-3 -translate-x-1/2 rotate-45 rounded-sm shadow-sm ${colorClass}`}
        title={formatDate(single)}
        style={{ left: `${left}%` }}
      />
      <span className="absolute top-[11px] ml-3 whitespace-nowrap text-xs font-medium text-slate-400" style={{ left: `${left}%` }}>
        {end ? "截止" : "开始"}
      </span>
    </>
  );
}

function TimelineHint({ children }: { children: string }) {
  return <span className="absolute top-3 max-w-full truncate text-xs font-medium text-slate-400">{children}</span>;
}

function barClassName(row: GanttRow) {
  if (row.kind === "task") return "bg-sky-300";
  return row.status ? STATUS_BAR_CLASS[row.status] ?? "bg-cyan-600" : "bg-cyan-600";
}

function statusBadgeClassName(status: string) {
  if (status === "进行中") return "bg-emerald-50 text-emerald-700";
  if (status === "已完成") return "bg-green-50 text-green-700";
  if (status === "已终止") return "bg-rose-50 text-rose-600";
  return "bg-lime-50 text-lime-700";
}

function ownerBadgeText(names: string[]) {
  if (names.length <= 2) return names.join("、");
  return `${names.slice(0, 2).join("、")} 等${names.length}人`;
}

function StageTimeline({
  stages,
  periodStart,
  periodEnd,
  fallbackStart,
  fallbackEnd,
}: {
  stages: ProjectGanttStageSegment[];
  periodStart: Date;
  periodEnd: Date;
  fallbackStart: Date | null;
  fallbackEnd: Date | null;
}) {
  const visibleSegments = stages.filter((stage) => stage.startDate && stage.endDate);
  return (
    <>
      {fallbackStart && fallbackEnd && fallbackEnd >= fallbackStart && (
        <span className="absolute left-0 right-0 top-[21px] h-px bg-slate-200/70" />
      )}
      {visibleSegments.map((stage) => (
        <StageSegment key={stage.id} stage={stage} periodStart={periodStart} periodEnd={periodEnd} />
      ))}
    </>
  );
}

function StageSegment({ stage, periodStart, periodEnd }: { stage: ProjectGanttStageSegment; periodStart: Date; periodEnd: Date }) {
  const start = parseGanttDate(stage.startDate);
  const end = parseGanttDate(stage.endDate);
  if (!start || !end || end < start) return null;
  const colorClass = STAGE_BAR_CLASS[stage.stage] ?? "bg-slate-400";
  const left = datePercent(start, periodStart, periodEnd);
  const right = datePercent(end, periodStart, periodEnd);
  const visibleStart = Math.max(0, Math.min(left, right));
  const visibleEnd = Math.min(100, Math.max(left, right));
  if (visibleEnd <= 0 || visibleStart >= 100) return null;
  return (
    <span
      className={`absolute top-[15px] h-3 min-w-3 rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.12)] ${colorClass}`}
      title={stageTitle(stage)}
      style={{ left: `${visibleStart}%`, width: `${Math.max(1.2, visibleEnd - visibleStart)}%` }}
    />
  );
}

function MilestoneMarks({
  events,
  periodStart,
  periodEnd,
}: {
  events: GanttMilestoneEvent[];
  periodStart: Date;
  periodEnd: Date;
}) {
  return (
    <>
      {events.map((event) => {
        const date = parseGanttDate(event.date);
        if (!date) return null;
        const left = datePercent(date, periodStart, periodEnd);
        if (left <= 0 || left >= 100) return null;
          return (
            <span
              key={event.key}
              className="absolute top-[21px] size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-amber-500 bg-amber-300 shadow-sm"
              title={event.name}
              style={{ left: `${left}%` }}
            />
        );
      })}
    </>
  );
}

function stageTitle(stage: ProjectGanttStageSegment) {
  return [stage.stage, stage.startDate, stage.endDate ? `至 ${stage.endDate}` : null, stage.note].filter(Boolean).join(" · ");
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
