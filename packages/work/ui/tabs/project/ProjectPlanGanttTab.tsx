"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyStateCard, Toolbar, useConfirm, type ToolbarItem } from "@workspace/core/ui";
import { matchText } from "@workspace/core/search";
import type { ProjectItem } from "./model";
import { listProjectOptions, listProjectPlanGantt, saveProjectPlanDependencies, saveProjectPlanGantt } from "./api";
import ProjectPlanGanttTimeline from "./ProjectPlanGanttTimeline";
import type { ProjectGanttZoom } from "./gantt-model";
import { PROJECT_GANTT_ZOOM_OPTIONS } from "./gantt-model";
import { periodStart as getPeriodStart, shiftPeriod } from "./gantt-time";
import type { ProjectPlanDependency, ProjectPlanGanttData, ProjectPlanItem } from "./plan-gantt-model";
export default function ProjectPlanGanttTab({
  requestedProjectId
}: {
  requestedProjectId?: number | null;
}) {
  const confirm = useConfirm();
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
  const dirty = data ? JSON.stringify(itemsForSave(items)) !== JSON.stringify(itemsForSave(data.items)) || JSON.stringify(dependenciesForSave(dependencies)) !== JSON.stringify(dependenciesForSave(data.dependencies)) : false;
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
      await saveProjectPlanGantt(selectedProjectId, itemsForSave(items));
      await saveProjectPlanDependencies(selectedProjectId, dependenciesForSave(dependencies));
      await reloadPlan(selectedProjectId);
    } catch (err) {
      await confirm({
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
  return <div className="space-y-4">
      <Toolbar
        items={[
          {
            kind: "search",
            key: "search",
            section: "filter",
            value: keyword,
            onChange: setKeyword,
            placeholder: "搜索项目...",
            ariaLabel: "搜索项目",
            className: "w-52",
          },
          {
            kind: "select",
            key: "project",
            section: "filter",
            value: selectedProjectId ? String(selectedProjectId) : "",
            placeholder: "选择项目",
            options: filteredProjects.map((project) => ({ value: String(project.id), label: project.name })),
            onChange: (value) => setSelectedProjectId(value ? Number(value) : null),
            className: "min-w-52",
            triggerClassName: "min-w-52",
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
        ] satisfies ToolbarItem[]}
      />

      {error ? <EmptyStateCard compact={false} className="border-red-200 text-red-600">{error}</EmptyStateCard> : loading ? <EmptyStateCard compact={false}>加载项目甘特...</EmptyStateCard> : !data ? <EmptyStateCard compact={false}>请选择项目</EmptyStateCard> : <ProjectPlanGanttTimeline items={items} phases={data.phases} dependencies={dependencies} periodStart={currentStart} zoom={zoom} />}
    </div>;
}
function itemsForSave(items: ProjectPlanItem[]) {
  return items.map(item => ({
    kind: item.kind,
    id: item.id,
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    phaseId: item.kind === "project" ? null : item.phaseId ?? null
  }));
}
function dependenciesForSave(dependencies: ProjectPlanDependency[]) {
  return dependencies.map(dependency => ({
    predecessorKind: dependency.predecessorKind,
    predecessorId: dependency.predecessorId,
    successorKind: dependency.successorKind,
    successorId: dependency.successorId,
    lagDays: dependency.lagDays ?? 1
  })).sort((left, right) => `${left.successorKind}:${left.successorId}`.localeCompare(`${right.successorKind}:${right.successorId}`));
}
function periodLabel(start: Date, zoom: ProjectGanttZoom) {
  if (zoom === "year") return `${start.getFullYear()}年`;
  if (zoom === "quarter") return `${start.getFullYear()}年 Q${Math.floor(start.getMonth() / 3) + 1}`;
  return `${start.getFullYear()}年 ${start.getMonth() + 1}月`;
}
