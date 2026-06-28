"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageSurface, createPageBody, createPageDataBlock } from "@workspace/core/ui";
import type { PageSurfaceBlockSpec, PageSurfaceProps, SurfaceToolbarItems } from "@workspace/core/ui";
import type { WorkUser } from "@workspace/work/types";
import { listProjectGantt } from "./api";
import ProjectGanttChart from "./ProjectGanttChart";
import { PROJECT_GANTT_LEVEL_OPTIONS, PROJECT_GANTT_TASK_OPTIONS, PROJECT_GANTT_ZOOM_OPTIONS, buildProjectGanttRows, defaultGanttExpandedKeys, type ProjectGanttData, type ProjectGanttLevelFilter, type ProjectGanttZoom } from "./gantt-model";
import { periodStart as getPeriodStart, shiftPeriod } from "./gantt-time";
export default function ProjectGanttTab({
  user,
  surface,
}: {
  user: WorkUser;
  surface?: ProjectGanttSurfaceProps;
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
  const toolbarItems = [{
      kind: "search",
      key: "search",
      section: "filter",
      value: keyword,
      onChange: setKeyword,
      placeholder: "搜索项目、部门、任务...",
      ariaLabel: "搜索公司甘特",
    }, {
      kind: "option-group",
      key: "include-tasks",
      section: "filter",
      ariaLabel: "是否包括任务",
      value: includeTasks ? "1" : "0",
      options: PROJECT_GANTT_TASK_OPTIONS,
      onChange: value => setIncludeTasks(value === "1"),
    }, {
      kind: "select",
      key: "level-filter",
      section: "filter",
      label: "级别",
      value: level,
      options: [...PROJECT_GANTT_LEVEL_OPTIONS],
      onChange: value => setLevel(value as ProjectGanttLevelFilter),
    }, {
      kind: "option-group",
      key: "zoom",
      section: "edit",
      ariaLabel: "甘特时间缩放",
      value: zoom,
      options: PROJECT_GANTT_ZOOM_OPTIONS,
      onChange: value => changeZoom(value as ProjectGanttZoom),
    }, {
      kind: "period",
      key: "period-controls",
      mode: "nav",
      label: periodLabel(currentStart, zoom),
      onPrevious: () => setCurrentStart(current => shiftPeriod(current, zoom, -1)),
      onNext: () => setCurrentStart(current => shiftPeriod(current, zoom, 1)),
    }, {
      kind: "text",
      key: "meta",
      section: "meta",
      content: `${rows.length} 行`
    }] satisfies SurfaceToolbarItems;
  const blocks = error ? [
    createPageDataBlock("project-gantt-error", { kind: "records", records: [], empty: error, className: "border-red-200 text-red-600" }),
  ] : loading && !hasLoaded ? [
    createPageDataBlock("project-gantt-loading", { kind: "records", records: [], empty: "加载公司甘特..." }),
  ] : [
    {
      kind: "visualization" as const,
      key: "project-gantt-chart",
      surface: {
        kind: "gantt" as const,
        title: "公司甘特",
        framed: true,
        content: <ProjectGanttChart rows={rows} periodStart={currentStart} zoom={zoom} onToggle={toggleExpanded} />,
      },
    },
  ] satisfies PageSurfaceBlockSpec[];

	  return <PageSurface kind="list" {...surface} toolbar={{ items: toolbarItems }} body={createPageBody(blocks)} />;
	}
type ProjectGanttSurfaceProps = Pick<PageSurfaceProps, "navigation">;

function periodLabel(start: Date, zoom: ProjectGanttZoom) {
  if (zoom === "year") return `${start.getFullYear()}年`;
  if (zoom === "quarter") return `${start.getFullYear()}年 Q${Math.floor(start.getMonth() / 3) + 1}`;
  return `${start.getFullYear()}年 ${start.getMonth() + 1}月`;
}
