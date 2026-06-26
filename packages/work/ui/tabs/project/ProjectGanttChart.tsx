"use client";

import { FormSurface } from "@workspace/core/ui";
import {
  type GanttMilestoneEvent,
  type GanttRow,
  type ProjectGanttStageSegment,
  type ProjectGanttZoom,
} from "./gantt-model";
import { buildGanttTicks, datePercent, parseGanttDate, rangeEnd } from "./gantt-time";

const LEFT_COLUMN_WIDTH = 360;
const ROW_GRID = "grid-cols-[360px_minmax(0,1fr)]";
const ACTUAL_ON_TRACK_CLASS = "bg-[#00b8a6] shadow-[0_2px_5px_rgba(0,150,136,0.22)]";
const ACTUAL_DELAYED_CLASS = "bg-[#e56b6f] shadow-[0_2px_5px_rgba(210,72,80,0.22)]";
const BASELINE_BAR_CLASS = "bg-slate-400/75 ring-1 ring-slate-500/15 shadow-[0_1px_3px_rgba(71,85,105,0.18)]";
const STAGE_BAR_CLASS: Record<string, string> = {
  "规划中": "bg-emerald-300",
  "进行中": ACTUAL_ON_TRACK_CLASS,
  "暂停": ACTUAL_DELAYED_CLASS,
  "已完成": ACTUAL_ON_TRACK_CLASS,
  "已终止": ACTUAL_DELAYED_CLASS,
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
    <FormSurface
      kind="fields"
      fields={[{
        kind: "section",
        key: "company-gantt",
        title: "公司甘特",
        bodyClassName: "min-w-0 overflow-hidden p-0",
        fields: [{
          kind: "note",
          key: "gantt-body",
          content: rows.length === 0 ? "暂无匹配项目" : (
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
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 px-4" style={{ left: LEFT_COLUMN_WIDTH }}>
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
                  className={`relative grid ${ROW_GRID} min-h-[48px] border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70`}
                >
                  <div className="min-w-0 px-4 py-2">
                    <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${row.depth * 18}px` }}>
                      <button
                        type="button"
                        disabled={!row.hasChildren}
                        onClick={() => onToggle(row.key)}
                        className={`grid size-5 shrink-0 place-items-center rounded border text-xs font-semibold transition ${
                          row.hasChildren
                            ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {row.hasChildren ? (row.expanded ? "⌄" : "›") : "·"}
                      </button>
                      <RowTitle row={row} />
                    </div>
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
                    <div className="relative h-8">
                      <BaselineMark row={row} periodStart={periodStart} periodEnd={periodEnd} />
                      <TimelineMark row={row} periodStart={periodStart} periodEnd={periodEnd} />
                      {row.milestoneEvents.length > 0 && (
                        <MilestoneMarks row={row} events={row.milestoneEvents} periodStart={periodStart} periodEnd={periodEnd} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
          ),
        }],
      }]}
    />
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
      className={`absolute top-[15px] z-0 min-w-3 rounded-md ${barHeightClassName(row)} ${BASELINE_BAR_CLASS}`}
      title={`基准 ${formatDate(start)} - ${formatDate(end)}`}
      style={{ left: `${visibleStart}%`, width: `${Math.max(1.2, visibleEnd - visibleStart)}%` }}
    />
  );
}

function RowTitle({ row }: { row: GanttRow }) {
  const titleClassName = row.kind === "project" ? "text-sm font-semibold text-slate-900" : "text-sm font-medium text-slate-600";
  return (
    <div className="flex min-w-0 items-center gap-2" title={row.name}>
      <span className={`min-w-0 truncate ${titleClassName}`}>{row.name}</span>
      {row.ownerNames.length > 0 && (
        <span className="shrink-0 rounded bg-yellow-50 px-1.5 py-0.5 text-xs font-medium text-yellow-700">
          {ownerBadgeText(row.ownerNames)}
        </span>
      )}
    </div>
  );
}

function TimelineMark({ row, periodStart, periodEnd }: { row: GanttRow; periodStart: Date; periodEnd: Date }) {
  const start = parseGanttDate(row.startDate || row.aggregateStart);
  const end = parseGanttDate(row.endDate || row.aggregateEnd);
  const colorClass = actualBarClassName(row);

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
        <span className={`absolute left-0 right-0 ${actualCenterTopClassName(row)} h-px bg-slate-200/50`} />
        <div
          className={`absolute top-[15px] z-10 min-w-4 rounded-md ${barHeightClassName(row)} ${colorClass}`}
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
        className={`absolute ${actualCenterTopClassName(row)} z-20 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm shadow-sm ${colorClass}`}
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

function actualBarClassName(row: GanttRow) {
  return isDelayed(row) ? ACTUAL_DELAYED_CLASS : ACTUAL_ON_TRACK_CLASS;
}

function isDelayed(row: GanttRow) {
  const baselineEnd = parseGanttDate(row.baselineEndDate);
  if (!baselineEnd) return false;
  const actualEnd = parseGanttDate(row.endDate || row.aggregateEnd);
  if (actualEnd) return actualEnd > baselineEnd;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > baselineEnd;
}

function barHeightClassName(row: GanttRow) {
  return row.kind === "task" ? "h-3" : "h-2";
}

function actualCenterTopClassName(row: GanttRow) {
  return row.kind === "task" ? "top-[21px]" : "top-[19px]";
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
        <span className="absolute left-0 right-0 top-[19px] h-px bg-slate-200/50" />
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
      className={`absolute top-[15px] z-10 h-2 min-w-3 rounded-md ${colorClass}`}
      title={stageTitle(stage)}
      style={{ left: `${visibleStart}%`, width: `${Math.max(1.2, visibleEnd - visibleStart)}%` }}
    />
  );
}

function MilestoneMarks({
  row,
  events,
  periodStart,
  periodEnd,
}: {
  row: GanttRow;
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
            className={`absolute ${actualCenterTopClassName(row)} z-20 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border border-amber-500 bg-amber-300 shadow-sm`}
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
