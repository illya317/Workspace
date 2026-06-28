"use client";

import { useEffect, useMemo, useState } from "react";
import { PageSurface, createPageBody, createPageDataBlock, useFeedback } from "@workspace/core/ui";
import type { PageSurfaceBlockSpec, PageSurfaceProps, SurfaceToolbarItems, VisualizationGanttDependencySpec, VisualizationGanttRowSpec } from "@workspace/core/ui";
import { matchText } from "@workspace/core/search";
import type { ProjectItem } from "./model";
import { listProjectOptions, listProjectPlanGantt, saveProjectPlanDependencies, saveProjectPlanGantt } from "./api";
import type { ProjectGanttZoom } from "./gantt-model";
import { PROJECT_GANTT_ZOOM_OPTIONS } from "./gantt-model";
import { periodStart as getPeriodStart, shiftPeriod } from "./gantt-time";
import { hasPlanGanttChanges, itemKey, planDependenciesForSave, planGanttItemsForSave } from "./plan-gantt-schedule";
import type { ProjectPlanDependency, ProjectPlanGanttData, ProjectPlanItem } from "./plan-gantt-model";
import { buildTimelineRows } from "./plan-gantt-timeline-model";
export default function ProjectPlanGanttTab({
  requestedProjectId,
  surface,
}: {
  requestedProjectId?: number | null;
  surface?: ProjectPlanGanttSurfaceProps;
}) {
  const feedback = useFeedback();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(requestedProjectId || null);
  const [data, setData] = useState<ProjectPlanGanttData | null>(null);
  const [items, setItems] = useState<ProjectPlanItem[]>([]);
  const [dependencies, setDependencies] = useState<ProjectPlanDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ProjectGanttZoom>("year");
  const [currentStart, setCurrentStart] = useState(() => getPeriodStart(new Date(), "year"));
  useEffect(() => {
    let cancelled = false;
    listProjectOptions().then(next => {
      if (cancelled) return;
      setProjects(next);
      setSelectedProjectId(current => current || (next[0]?.id ?? null));
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : "加载项目列表失败");
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!selectedProjectId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listProjectPlanGantt(selectedProjectId).then(next => {
      if (cancelled) return;
      setData(next);
      setItems(next.items);
      setDependencies(next.dependencies);
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : "加载项目甘特失败");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);
  const filteredProjects = useMemo(() => {
    const key = keyword.trim();
    if (!key) return projects;
    return projects.filter(project => matchText([project.name, project.code, project.leadingDepartmentName].filter(Boolean).join(" "), key));
  }, [projects, keyword]);
  const dirty = data ? hasPlanGanttChanges({
    items,
    dependencies,
    savedItems: data.items,
    savedDependencies: data.dependencies,
  }) : false;
  const canEdit = Boolean(data?.permissions.canEdit);
  function changeZoom(nextZoom: ProjectGanttZoom) {
    setZoom(nextZoom);
    setCurrentStart(current => getPeriodStart(current, nextZoom));
  }
  async function reloadPlan(projectId = selectedProjectId) {
    if (!projectId) return;
    const next = await listProjectPlanGantt(projectId);
    setData(next);
    setItems(next.items);
    setDependencies(next.dependencies);
  }
  async function handleSave() {
    if (!selectedProjectId || !data) return;
    setSaving(true);
    try {
      await saveProjectPlanGantt(selectedProjectId, planGanttItemsForSave(items));
      await saveProjectPlanDependencies(selectedProjectId, planDependenciesForSave(dependencies));
      await reloadPlan(selectedProjectId);
    } catch (err) {
      await feedback.confirm({
        title: "保存失败",
        message: err instanceof Error ? err.message : "保存项目甘特失败",
        confirmLabel: "关闭",
        confirmDanger: true,
        showCancel: false
      });
    } finally {
      setSaving(false);
    }
  }
  const toolbarItems = [
    {
      kind: "search",
      key: "search",
      section: "filter",
      value: keyword,
      onChange: setKeyword,
      placeholder: "搜索项目...",
      ariaLabel: "搜索项目",
    },
    {
      kind: "select",
      key: "project",
      section: "filter",
      value: selectedProjectId ? String(selectedProjectId) : "",
      placeholder: "选择项目",
      options: filteredProjects.map((project) => ({ value: String(project.id), label: project.name })),
      onChange: (value) => setSelectedProjectId(value ? Number(value) : null),
    },
    {
      kind: "option-group",
      key: "zoom",
      section: "filter",
      value: zoom,
      options: PROJECT_GANTT_ZOOM_OPTIONS,
      onChange: (value) => changeZoom(value as ProjectGanttZoom),
      ariaLabel: "甘特时间缩放",
    },
    {
      kind: "period",
      key: "period-nav",
      mode: "nav",
      label: periodLabel(currentStart, zoom),
      onPrevious: () => setCurrentStart((current) => shiftPeriod(current, zoom, -1)),
      onNext: () => setCurrentStart((current) => shiftPeriod(current, zoom, 1)),
    },
    {
      kind: "action-group",
      key: "save",
      section: "edit",
      actions: [
        {
          key: "save",
          kind: "save",
          label: saving ? "保存中..." : "保存甘特",
          disabled: !canEdit || saving || !dirty,
          variant: "primary",
          onClick: handleSave,
        },
      ],
    },
    {
      kind: "text",
      key: "meta",
      section: "meta",
      content: "基线来自项目阶段",
    },
  ] satisfies SurfaceToolbarItems;
  const timelineBlock: PageSurfaceBlockSpec = error
    ? createPageDataBlock("project-plan-gantt-error", { kind: "records", records: [], empty: error, className: "border-red-200 text-red-600" })
    : loading
      ? createPageDataBlock("project-plan-gantt-loading", { kind: "records", records: [], empty: "加载项目甘特..." })
      : !data
        ? createPageDataBlock("project-plan-gantt-empty", { kind: "records", records: [], empty: "请选择项目" })
        : {
        kind: "visualization" as const,
        key: "project-plan-gantt-timeline",
        surface: {
          kind: "gantt" as const,
          title: "项目甘特",
          framed: true,
          gantt: {
            kind: "gantt",
            rows: buildTimelineRows(items, data.phases).map(toVisualizationGanttRow),
            dependencies: dependencies.map(toVisualizationGanttDependency),
            periodStart: currentStart,
            zoom,
            leftHeader: "项目 / 任务",
            emptyText: "暂无计划节点",
          },
        },
      };
  const blocks = [timelineBlock] satisfies PageSurfaceBlockSpec[];
	  return <PageSurface kind="list" {...surface} toolbar={{ items: toolbarItems }} body={createPageBody(blocks)} />;
	}
type ProjectPlanGanttSurfaceProps = Pick<PageSurfaceProps, "navigation">;

function periodLabel(start: Date, zoom: ProjectGanttZoom) {
  if (zoom === "year") return `${start.getFullYear()}年`;
  if (zoom === "quarter") return `${start.getFullYear()}年 Q${Math.floor(start.getMonth() / 3) + 1}`;
  return `${start.getFullYear()}年 ${start.getMonth() + 1}月`;
}

function toVisualizationGanttRow(row: ReturnType<typeof buildTimelineRows>[number]): VisualizationGanttRowSpec {
  return {
    key: row.key,
    label: row.name,
    kind: row.kind,
    depth: row.depth,
    ownerNames: row.ownerNames,
    startDate: row.startDate,
    endDate: row.endDate,
    baselineStartDate: row.baselineStartDate,
    baselineEndDate: row.baselineEndDate,
    isMilestone: row.isMilestone,
  };
}

function toVisualizationGanttDependency(dependency: ProjectPlanDependency): VisualizationGanttDependencySpec {
  return {
    key: `${dependency.predecessorKind}:${dependency.predecessorId}-${dependency.successorKind}:${dependency.successorId}`,
    fromKey: itemKey({ kind: dependency.predecessorKind, id: dependency.predecessorId }),
    toKey: itemKey({ kind: dependency.successorKind, id: dependency.successorId }),
  };
}
