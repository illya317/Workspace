"use client";

import type { BodySurfaceSectionSpec, VisualizationGanttZoom } from "@workspace/core/ui";
import { createMessageSection } from "@workspace/core/ui";
import type { WorkItem, WorkPlan } from "./types";
import { buildWorkPlanGanttRows, hasWorkPlanGanttTargetPlans } from "./work-plan-gantt-model";

export function createWorkPlanGanttSection({
  plans,
  works,
  loading,
  periodStart,
  zoom,
  expandedKeys,
  onToggleRow,
}: {
  plans: WorkPlan[];
  works: WorkItem[];
  loading: boolean;
  periodStart: Date;
  zoom: VisualizationGanttZoom;
  expandedKeys?: ReadonlySet<string>;
  onToggleRow?: (key: string) => void;
}): BodySurfaceSectionSpec {
  if (!hasWorkPlanGanttTargetPlans(plans)) {
    return createMessageSection("gantt-no-target-plans", {
      content: loading ? "加载目标执行甘特中..." : "当前空间暂无可展示的季度或月度目标。",
      tone: "muted",
    });
  }

  const rows = buildWorkPlanGanttRows({ plans, works, periodStart, zoom, expandedKeys });
  return {
    key: "work-plan-gantt",
    header: {
      title: "甘特图",
      badges: [
        ...(zoom === "year" ? [{ key: "grouped", label: "按季度", tone: "info" } as const] : []),
        { key: "planned", label: "计划", tone: "muted" },
        { key: "actual", label: "实际", tone: "success" },
        { key: "milestone", label: "里程碑", tone: "warning" },
      ],
    },
    body: {
      kind: "visualization",
      visualization: {
        kind: "gantt",
        gantt: {
          frame: { title: "当前时间段目标执行" },
          timeline: {
            kind: "gantt",
            rows,
            periodStart,
            zoom,
            leftHeader: zoom === "year" ? "季度 / 目标 / 任务" : "目标 / 任务",
            emptyText: loading ? "加载目标执行甘特中..." : "当前时间段暂无可排期目标或任务",
            onToggle: onToggleRow,
          },
        },
      },
    },
  };
}
