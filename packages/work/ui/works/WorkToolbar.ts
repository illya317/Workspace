"use client";

import { spaceWorkbenchPanelToolbarItems } from "@workspace/platform/ui";
import type { SurfaceToolbarItem, SurfaceToolbarItems } from "@workspace/core/ui";
import { WORK_PLAN_PERIOD_FILTER_OPTIONS, type WorkPlanPeriodFilter } from "./work-plan-period-filter";
import type { WorkStatusFilter } from "./work-status-filter";
import type { WorkTargetType } from "./types";

export type WorkSpaceTypeFilter = "all" | WorkTargetType;

export function createWorkToolbarItems({
  hasSpace,
  sideOpen,
  activeTab,
  planPeriodFilter,
  statusFilter,
  planPageToolbarItem,
  reportToolbarItems,
  settingsToolbarItems,
  onToggleSide,
  onPlanPeriodFilterChange,
  onStatusFilterChange,
}: {
  hasSpace: boolean;
  sideOpen: boolean;
  activeTab: string;
  planPeriodFilter: WorkPlanPeriodFilter;
  statusFilter: WorkStatusFilter;
  planPageToolbarItem: SurfaceToolbarItem;
  reportToolbarItems: SurfaceToolbarItems;
  settingsToolbarItems: SurfaceToolbarItems;
  onToggleSide: () => void;
  onPlanPeriodFilterChange: (value: WorkPlanPeriodFilter) => void;
  onStatusFilterChange: (value: WorkStatusFilter) => void;
}): SurfaceToolbarItems {
  if (activeTab === "settings") return settingsToolbarItems;
  if (!hasSpace) return [];
  return [
    ...spaceWorkbenchPanelToolbarItems({
      label: activeTab === "work-reporting" ? "汇报周期" : activeTab === "reports" ? "考核周期" : activeTab === "tasks" ? "工作计划" : "工作空间",
      open: sideOpen,
      onToggleSide,
    }),
    ...(activeTab === "tasks" ? [
      {
        kind: "option-group" as const,
        key: "plan-period-filter",
        value: planPeriodFilter,
        options: WORK_PLAN_PERIOD_FILTER_OPTIONS,
        onChange: (value: string) => onPlanPeriodFilterChange(value as WorkPlanPeriodFilter),
        ariaLabel: "计划周期",
        presentation: "segmented" as const,
      },
      planPageToolbarItem,
      {
        kind: "option-group" as const,
        key: "status",
        value: statusFilter,
        options: [{ value: "active", label: "进行中" }, { value: "done", label: "已完成" }, { value: "archived", label: "已归档" }],
        onChange: (value: string) => onStatusFilterChange(value as WorkStatusFilter),
        ariaLabel: "子任务状态",
      },
    ] : []),
    ...(activeTab === "reports" ? reportToolbarItems : []),
  ];
}
