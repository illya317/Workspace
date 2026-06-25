"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyStateCard, OptionPicker, Toolbar } from "@workspace/core/ui";
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
      kind: "search",
      key: "search",
      section: "filter",
      value: keyword,
      onChange: setKeyword,
      placeholder: "搜索项目、部门、任务...",
      ariaLabel: "搜索公司甘特",
      className: "w-52",
    }, {
      kind: "option-group",
      key: "include-tasks",
      section: "filter",
      ariaLabel: "是否包括任务",
      value: includeTasks ? "1" : "0",
      options: PROJECT_GANTT_TASK_OPTIONS,
      onChange: value => setIncludeTasks(value === "1"),
    }, {
      kind: "custom",
      key: "level-filter",
      section: "filter",
      content: <LevelFilter level={level} onChange={setLevel} />,
    }, {
      kind: "option-group",
      key: "zoom",
      section: "edit",
      ariaLabel: "甘特时间缩放",
      value: zoom,
      options: PROJECT_GANTT_ZOOM_OPTIONS,
      onChange: value => changeZoom(value as ProjectGanttZoom),
    }, {
      kind: "custom",
      key: "period-controls",
      section: "edit",
      content: (
        <div className="inline-flex h-10 items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Toolbar
            variant="inline"
            items={[
              {
                kind: "icon-button",
                key: "prev-period",
                icon: "panel-close",
                label: "上一期间",
                className: "!h-10 !w-auto rounded-none border-0 px-3 shadow-none hover:bg-slate-50",
                iconClassName: "h-4 w-4",
                onClick: () => setCurrentStart(current => shiftPeriod(current, zoom, -1)),
              },
            ]}
          />
          <div className="min-w-28 border-x border-slate-200 px-3 text-center text-xs font-semibold text-slate-600">{periodLabel(currentStart, zoom)}</div>
          <Toolbar
            variant="inline"
            items={[
              {
                kind: "icon-button",
                key: "next-period",
                icon: "panel-open",
                label: "下一期间",
                className: "!h-10 !w-auto rounded-none border-0 px-3 shadow-none hover:bg-slate-50",
                iconClassName: "h-4 w-4",
                onClick: () => setCurrentStart(current => shiftPeriod(current, zoom, 1)),
              },
            ]}
          />
        </div>
      ),
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
  return (
    <OptionPicker
      value={level}
      options={[...PROJECT_GANTT_LEVEL_OPTIONS]}
      onChange={(value) => onChange((value ?? "all") as ProjectGanttLevelFilter)}
      placeholder="级别"
      formatValueLabel={(value, option) => value === "all" ? "级别" : `级别 ${option?.label ?? value}`}
      buttonClassName="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-56 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl"
      gridColumns={3}
      visibleCount={PROJECT_GANTT_LEVEL_OPTIONS.length}
      placeholderInGrid
    />
  );
}
function periodLabel(start: Date, zoom: ProjectGanttZoom) {
  if (zoom === "year") return `${start.getFullYear()}年`;
  if (zoom === "quarter") return `${start.getFullYear()}年 Q${Math.floor(start.getMonth() / 3) + 1}`;
  return `${start.getFullYear()}年 ${start.getMonth() + 1}月`;
}
