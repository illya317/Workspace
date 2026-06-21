"use client";

import { SectionCard } from "@workspace/core/ui";

export type ProjectGanttItem = {
  id: number;
  name: string;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BAR_CLASS_BY_STATUS: Record<string, string> = {
  "规划中": "bg-sky-500",
  "进行中": "bg-teal-600",
  "暂停": "bg-amber-400",
  "已完成": "bg-slate-500",
  "已取消": "bg-rose-400",
};
const gridClassName = "grid-cols-[112px_minmax(0,1fr)] sm:grid-cols-[128px_minmax(0,1fr)]";

export default function ProjectGanttSection({ parentProject, projects }: { parentProject?: ProjectGanttItem | null; projects: ProjectGanttItem[] }) {
  const allProjects = parentProject ? [parentProject, ...projects] : projects;
  const rows = allProjects.map((project, index) => ({
    ...project,
    isParent: index === 0 && Boolean(parentProject),
    start: parseDate(project.startDate),
    end: parseDate(project.endDate),
  }));
  const dated = rows.flatMap((row) => [row.start, row.end]).filter((date): date is Date => Boolean(date));
  const today = startOfDay(new Date());
  const rangeStart = dated.length ? minDate(dated) : today;
  const rangeEnd = dated.length ? maxDate(dated) : addDays(today, 90);
  const paddedStart = addDays(rangeStart, -7);
  const paddedEnd = addDays(rangeEnd <= paddedStart ? addDays(paddedStart, 30) : rangeEnd, 7);
  const totalDays = Math.max(1, diffDays(paddedStart, paddedEnd));
  const monthTicks = buildMonthTicks(paddedStart, paddedEnd);
  const todayVisible = today >= paddedStart && today <= paddedEnd;
  const todayLeft = datePercent(today, paddedStart, totalDays);

  return (
    <SectionCard title="子项目排期" bodyClassName="p-0">
      <div className="overflow-hidden">
        <div className="w-full">
          <div className={`grid ${gridClassName} border-b border-slate-100 bg-slate-50/80 text-xs font-semibold text-slate-500`}>
            <div className="px-3 py-3">项目名称</div>
            <div className="relative px-3 py-3">
              <div className="relative h-5">
                {monthTicks.map((tick) => (
                  <div
                    key={tick.key}
                    className="absolute top-0 -translate-x-px whitespace-nowrap border-l border-slate-200/80 pl-2"
                    style={{ left: `${datePercent(tick.date, paddedStart, totalDays)}%` }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-400">暂无子项目排期</div>
          ) : (
            <div className="relative">
              {todayVisible && (
                <div className="pointer-events-none absolute inset-y-0 left-[112px] right-0 z-0 px-3 sm:left-[128px]">
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
                <div key={row.id} className={`relative z-10 grid ${gridClassName} border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50`}>
                  <div className="min-w-0 px-3 py-3">
                    <div className="truncate text-sm font-semibold text-slate-800" title={row.name}>{row.name}</div>
                    {row.isParent && <div className="mt-1 text-xs text-emerald-600">主项目排期</div>}
                    {row.status && <div className="mt-1 text-xs text-slate-400">{row.status}</div>}
                  </div>
                  <div className="relative px-3 py-3">
                    <div className="absolute inset-y-0 left-3 right-3">
                      {monthTicks.map((tick) => (
                        <span
                          key={`${row.id}-${tick.key}`}
                          className="absolute top-0 h-full border-l border-slate-100/90"
                          style={{ left: `${datePercent(tick.date, paddedStart, totalDays)}%` }}
                        />
                      ))}
                    </div>
                    <div className="relative h-9">
                      <TimelineMark row={row} rangeStart={paddedStart} totalDays={totalDays} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function TimelineMark({
  row,
  rangeStart,
  totalDays,
}: {
  row: ProjectGanttItem & { start: Date | null; end: Date | null };
  rangeStart: Date;
  totalDays: number;
}) {
  const colorClass = row.status ? BAR_CLASS_BY_STATUS[row.status] ?? "bg-cyan-600" : "bg-cyan-600";
  if (row.start && row.end) {
    const left = datePercent(row.start, rangeStart, totalDays);
    const right = datePercent(row.end, rangeStart, totalDays);
    return (
      <>
        <span className="absolute left-0 right-0 top-[17px] h-px bg-slate-200/70" />
        <div
          className={`absolute top-[11px] h-3 min-w-4 rounded-md ${colorClass} shadow-[0_1px_2px_rgba(15,23,42,0.12)]`}
          title={`${formatDate(row.start)} - ${formatDate(row.end)}`}
          style={{
            left: `${Math.min(left, right)}%`,
            width: `${Math.max(2, Math.abs(right - left))}%`,
          }}
        />
      </>
    );
  }

  const singleDate = row.end ?? row.start;
  if (singleDate) {
    return (
      <>
        <span
          className={`absolute top-[12px] h-3 w-3 -translate-x-1/2 rotate-45 rounded-sm ${colorClass} shadow-sm`}
          title={formatDate(singleDate)}
          style={{ left: `${datePercent(singleDate, rangeStart, totalDays)}%` }}
        />
        <span
          className="absolute top-[9px] ml-3 whitespace-nowrap text-xs font-medium text-slate-400"
          style={{ left: `${datePercent(singleDate, rangeStart, totalDays)}%` }}
        >
          {row.end ? "截止" : "开始"}
        </span>
      </>
    );
  }

  return <span className="absolute top-2 text-xs font-medium text-slate-400">未设日期</span>;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function diffDays(start: Date, end: Date) {
  return Math.ceil((end.getTime() - start.getTime()) / DAY_MS);
}

function minDate(dates: Date[]) {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function maxDate(dates: Date[]) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function datePercent(date: Date, rangeStart: Date, totalDays: number) {
  return Math.max(0, Math.min(100, (diffDays(rangeStart, date) / totalDays) * 100));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildMonthTicks(start: Date, end: Date) {
  const ticks: { key: string; label: string; date: Date }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const final = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= final) {
    ticks.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      label: `${cursor.getMonth() + 1}月`,
      date: new Date(cursor),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}
