"use client";

import { useEffect, useMemo, useState } from "react";
import { CommandToolbar, EmptyStateCard, PickerShell, SearchInput, ToolbarOptionGroup } from "@workspace/core/ui";
import type { WorkUser } from "@workspace/work/types";
import { listProjectGantt } from "./api";
import ProjectGanttChart from "./ProjectGanttChart";
import {
  PROJECT_GANTT_STATUS_OPTIONS,
  PROJECT_GANTT_TASK_OPTIONS,
  PROJECT_GANTT_ZOOM_OPTIONS,
  buildProjectGanttRows,
  defaultGanttExpandedKeys,
  type ProjectGanttData,
  type ProjectGanttZoom,
} from "./gantt-model";
import { periodStart as getPeriodStart, shiftPeriod } from "./gantt-time";

export default function ProjectGanttTab({ user }: { user: WorkUser }) {
  void user;
  const [data, setData] = useState<ProjectGanttData>({ projects: [], tasks: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [includeTasks, setIncludeTasks] = useState(false);
  const [statuses, setStatuses] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState<ProjectGanttZoom>("year");
  const [currentStart, setCurrentStart] = useState(() => getPeriodStart(new Date(), "year"));
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(["company"]));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listProjectGantt(includeTasks)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setExpandedKeys(defaultGanttExpandedKeys(next));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载项目甘特失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [includeTasks]);

  const rows = useMemo(() => buildProjectGanttRows({
    data,
    expandedKeys,
    keyword,
    statuses,
  }), [data, expandedKeys, keyword, statuses]);

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function changeZoom(nextZoom: ProjectGanttZoom) {
    setZoom(nextZoom);
    setCurrentStart((current) => getPeriodStart(current, nextZoom));
  }

  return (
    <div className="space-y-4">
      <CommandToolbar
        filters={(
          <>
            <SearchInput
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索项目、部门、任务..."
              ariaLabel="搜索项目甘特"
              size="toolbar"
              className="w-52"
            />
            <ToolbarOptionGroup
              ariaLabel="是否包括任务"
              value={includeTasks ? "1" : "0"}
              options={PROJECT_GANTT_TASK_OPTIONS}
              onChange={(value) => setIncludeTasks(value === "1")}
            />
            <StatusFilter statuses={statuses} onChange={setStatuses} />
          </>
        )}
        editActions={(
          <>
            <ToolbarOptionGroup
              ariaLabel="甘特时间缩放"
              value={zoom}
              options={PROJECT_GANTT_ZOOM_OPTIONS}
              onChange={(value) => changeZoom(value as ProjectGanttZoom)}
            />
            <div className="inline-flex h-10 items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <button type="button" className="h-10 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setCurrentStart((current) => shiftPeriod(current, zoom, -1))}>‹</button>
              <div className="min-w-28 border-x border-slate-200 px-3 text-center text-xs font-semibold text-slate-600">{periodLabel(currentStart, zoom)}</div>
              <button type="button" className="h-10 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setCurrentStart((current) => shiftPeriod(current, zoom, 1))}>›</button>
            </div>
          </>
        )}
        meta={`${rows.length} 行`}
      />

      {error ? (
        <EmptyStateCard compact={false} className="border-red-200 text-red-600">{error}</EmptyStateCard>
      ) : loading ? (
        <EmptyStateCard compact={false}>加载项目甘特...</EmptyStateCard>
      ) : (
        <ProjectGanttChart
          rows={rows}
          periodStart={currentStart}
          zoom={zoom}
          onToggle={toggleExpanded}
        />
      )}
    </div>
  );
}

function StatusFilter({
  statuses,
  onChange,
}: {
  statuses: Set<string>;
  onChange: (statuses: Set<string>) => void;
}) {
  const activeCount = statuses.size;
  return (
    <PickerShell
      valueLabel={activeCount ? `筛选 ${activeCount}` : "筛选"}
      buttonClassName={`h-10 rounded-lg border px-4 text-xs font-semibold shadow-sm transition ${
        activeCount
          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
      popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-64 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl"
    >
      {() => (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className={`rounded-md border px-2.5 py-2 text-center text-xs font-semibold transition ${
              activeCount === 0 ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            全部
          </button>
          {PROJECT_GANTT_STATUS_OPTIONS.map((status) => {
              const active = statuses.has(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    const next = new Set(statuses);
                    if (next.has(status)) next.delete(status);
                    else next.add(status);
                    onChange(next);
                  }}
                  className={`rounded-md border px-2.5 py-2 text-center text-xs font-semibold transition ${
                    active ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {status}
                </button>
              );
          })}
        </div>
      )}
    </PickerShell>
  );
}

function periodLabel(start: Date, zoom: ProjectGanttZoom) {
  if (zoom === "year") return `${start.getFullYear()}年`;
  if (zoom === "quarter") return `${start.getFullYear()}年 Q${Math.floor(start.getMonth() / 3) + 1}`;
  return `${start.getFullYear()}年 ${start.getMonth() + 1}月`;
}
