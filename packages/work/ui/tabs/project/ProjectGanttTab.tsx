"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyStateCard, PickerOptionButton, PickerShell, SearchInput, ToolbarOptionGroup, Toolbar, getToolbarActionClassName } from "@workspace/core/ui";
import type { WorkUser } from "@workspace/work/types";
import { listProjectGantt } from "./api";
import ProjectGanttChart from "./ProjectGanttChart";
import { PROJECT_GANTT_LEVEL_OPTIONS, PROJECT_GANTT_TASK_OPTIONS, PROJECT_GANTT_ZOOM_OPTIONS, buildProjectGanttRows, defaultGanttExpandedKeys, type ProjectGanttData, type ProjectGanttLevelFilter, type ProjectGanttZoom } from "./gantt-model";
import { periodStart as getPeriodStart, shiftPeriod } from "./gantt-time";
export default function ProjectGanttTab({
  user
}: {
  user: WorkUser;
}) {
  void user;
  const [data, setData] = useState<ProjectGanttData>({
    projects: [],
    tasks: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [includeTasks, setIncludeTasks] = useState(false);
  const [level, setLevel] = useState<ProjectGanttLevelFilter>("all");
  const [zoom, setZoom] = useState<ProjectGanttZoom>("year");
  const [currentStart, setCurrentStart] = useState(() => getPeriodStart(new Date(), "year"));
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(["company"]));
  const initializedExpansionRef = useRef(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listProjectGantt(includeTasks).then(next => {
      if (cancelled) return;
      setData(next);
      if (!initializedExpansionRef.current) {
        setExpandedKeys(defaultGanttExpandedKeys(next));
        initializedExpansionRef.current = true;
      }
      setHasLoaded(true);
    }).catch(err => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "加载公司甘特失败");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [includeTasks]);
  const rows = useMemo(() => buildProjectGanttRows({
    data,
    expandedKeys,
    keyword,
    level
  }), [data, expandedKeys, keyword, level]);
  function toggleExpanded(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);else next.add(key);
      return next;
    });
  }
  function changeZoom(nextZoom: ProjectGanttZoom) {
    setZoom(nextZoom);
    setCurrentStart(current => getPeriodStart(current, nextZoom));
  }
  return <div className="space-y-4">
      <Toolbar items={[{
      kind: "custom",
      key: "filters",
      section: "filter",
      content: <>
                <SearchInput value={keyword} onChange={setKeyword} placeholder="搜索项目、部门、任务..." ariaLabel="搜索公司甘特" className="w-52" />
                <ToolbarOptionGroup ariaLabel="是否包括任务" value={includeTasks ? "1" : "0"} options={PROJECT_GANTT_TASK_OPTIONS} onChange={value => setIncludeTasks(value === "1")} />
                <LevelFilter level={level} onChange={setLevel} />
              </>
    }, {
      kind: "custom",
      key: "edit-actions",
      section: "edit",
      content: <>
                <ToolbarOptionGroup ariaLabel="甘特时间缩放" value={zoom} options={PROJECT_GANTT_ZOOM_OPTIONS} onChange={value => changeZoom(value as ProjectGanttZoom)} />
                <div className="inline-flex h-10 items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <button type="button" onClick={() => setCurrentStart(current => shiftPeriod(current, zoom, -1))} className={[getToolbarActionClassName("secondary"), "rounded-none border-0 px-3 text-sm shadow-none hover:bg-slate-50"].filter(Boolean).join(" ")}>‹</button>
                  <div className="min-w-28 border-x border-slate-200 px-3 text-center text-xs font-semibold text-slate-600">{periodLabel(currentStart, zoom)}</div>
                  <button type="button" onClick={() => setCurrentStart(current => shiftPeriod(current, zoom, 1))} className={[getToolbarActionClassName("secondary"), "rounded-none border-0 px-3 text-sm shadow-none hover:bg-slate-50"].filter(Boolean).join(" ")}>›</button>
                </div>
              </>
    }, {
      kind: "text",
      key: "meta",
      section: "meta",
      content: `${rows.length} 行`
    }]} />

      {error ? <EmptyStateCard compact={false} className="border-red-200 text-red-600">{error}</EmptyStateCard> : loading && !hasLoaded ? <EmptyStateCard compact={false}>加载公司甘特...</EmptyStateCard> : <ProjectGanttChart rows={rows} periodStart={currentStart} zoom={zoom} onToggle={toggleExpanded} />}
    </div>;
}
function LevelFilter({
  level,
  onChange
}: {
  level: ProjectGanttLevelFilter;
  onChange: (level: ProjectGanttLevelFilter) => void;
}) {
  const active = level !== "all";
  const label = PROJECT_GANTT_LEVEL_OPTIONS.find(option => option.value === level)?.label ?? "全部";
  return <PickerShell valueLabel={active ? `级别 ${label}` : "级别"} buttonClassName={`h-10 rounded-lg border px-4 text-xs font-semibold shadow-sm transition ${active ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`} popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-56 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl">
      {() => <div className="grid grid-cols-3 gap-2">
          {PROJECT_GANTT_LEVEL_OPTIONS.map(option => <PickerOptionButton key={option.value} selected={option.value === level} onClick={() => onChange(option.value)} size="compact" className="px-2.5 py-2 font-semibold">
              {option.label}
            </PickerOptionButton>)}
        </div>}
    </PickerShell>;
}
function periodLabel(start: Date, zoom: ProjectGanttZoom) {
  if (zoom === "year") return `${start.getFullYear()}年`;
  if (zoom === "quarter") return `${start.getFullYear()}年 Q${Math.floor(start.getMonth() / 3) + 1}`;
  return `${start.getFullYear()}年 ${start.getMonth() + 1}月`;
}
