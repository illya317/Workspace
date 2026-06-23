"use client";

import { EmptyStateCard, SectionCard } from "@workspace/core/ui";
import {
  type GanttRow,
  type ProjectGanttZoom,
} from "./gantt-model";
import { buildGanttTicks, datePercent, parseGanttDate, rangeEnd } from "./gantt-time";

const ROW_GRID = "grid-cols-[280px_minmax(0,1fr)]";
const STATUS_BAR_CLASS: Record<string, string> = {
  "规划中": "bg-sky-500",
  "进行中": "bg-teal-600",
  "暂停": "bg-amber-400",
  "已完成": "bg-slate-500",
  "已取消": "bg-rose-400",
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
    <SectionCard title="项目甘特" bodyClassName="min-w-0 overflow-hidden p-0">
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
                        <div className={`truncate ${titleClassName(row.kind)}`} title={row.name}>
                          {row.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {row.status && <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusBadgeClassName(row.status)}`}>{row.status}</span>}
                          {row.projectLevel && row.projectLevel !== "普通" && <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${levelBadgeClassName(row.projectLevel)}`}>{row.projectLevel}</span>}
                          {row.isMilestone && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">里程碑</span>}
                          {row.kind === "task" && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700">任务</span>}
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
                      <TimelineMark row={row} periodStart={periodStart} periodEnd={periodEnd} />
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

function TimelineMark({ row, periodStart, periodEnd }: { row: GanttRow; periodStart: Date; periodEnd: Date }) {
  const start = parseGanttDate(row.startDate || row.aggregateStart);
  const end = parseGanttDate(row.endDate || row.aggregateEnd);
  const colorClass = barClassName(row);

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
  if (status === "暂停") return "bg-amber-50 text-amber-700";
  if (status === "进行中") return "bg-emerald-50 text-emerald-700";
  if (status === "已完成") return "bg-slate-100 text-slate-500";
  if (status === "已取消") return "bg-rose-50 text-rose-600";
  return "bg-sky-50 text-sky-700";
}

function titleClassName(kind: string) {
  if (kind === "task") return "text-sm font-medium text-slate-600";
  return "text-sm font-semibold text-slate-900";
}

function levelBadgeClassName(level: string) {
  if (level === "特殊") return "bg-rose-50 text-rose-700";
  if (level === "重点") return "bg-orange-50 text-orange-700";
  return "bg-slate-100 text-slate-500";
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
