"use client";

import { createSpaceViewToolbarItem, spaceWorkbenchPanelToolbarItems, type SpaceWorkbenchKindOption } from "@workspace/platform/ui";
import type { SurfaceToolbarItem, SurfaceToolbarItems } from "@workspace/core/ui";
import { WORK_ITEM_TYPE_OPTIONS } from "./model";
import type { WorkTargetType } from "./types";

export type WorkStatusFilter = "active" | "done" | "archived";
export type WorkSpaceTypeFilter = "all" | WorkTargetType;

const WORK_VIEW_OPTIONS: SpaceWorkbenchKindOption[] = [
  { key: "tasks", label: "OKR 计划" },
  { key: "reports", label: "工作汇报" },
  { key: "permissions", label: "权限设置" },
];

export function createWorkToolbarItems({
  hasSpace,
  sideOpen,
  activeTab,
  canManage,
  canCreate,
  planCreating,
  saving,
  planDraftTitle,
  statusFilter,
  itemTypeFilter,
  planPageToolbarItem,
  reportToolbarItems,
  onOpenDrawer,
  onToggleSide,
  onStatusFilterChange,
  onItemTypeFilterChange,
  onActiveTabChange,
  onCreatePlan,
  onSavePlan,
}: {
  hasSpace: boolean;
  sideOpen: boolean;
  activeTab: string;
  canCreate: boolean;
  canManage: boolean;
  planCreating: boolean;
  saving: boolean;
  planDraftTitle: string;
  statusFilter: WorkStatusFilter;
  itemTypeFilter: string;
  planPageToolbarItem: SurfaceToolbarItem;
  reportToolbarItems: SurfaceToolbarItems;
  onOpenDrawer: () => void;
  onToggleSide: () => void;
  onStatusFilterChange: (value: WorkStatusFilter) => void;
  onItemTypeFilterChange: (value: string) => void;
  onActiveTabChange: (value: string) => void;
  onCreatePlan: () => void;
  onSavePlan: () => void;
}): SurfaceToolbarItems {
  if (!hasSpace) return [];
  return [
    ...spaceWorkbenchPanelToolbarItems({
      label: "工作计划",
      open: sideOpen,
      onOpenDrawer,
      onToggleSide,
    }),
    createSpaceViewToolbarItem({
      key: "work-view",
      value: activeTab,
      options: canManage ? WORK_VIEW_OPTIONS : WORK_VIEW_OPTIONS.filter((option) => option.key !== "permissions"),
      onChange: onActiveTabChange,
      ariaLabel: "工作计划视图",
    }),
    ...(activeTab === "tasks" ? [
      planPageToolbarItem,
      {
        kind: "option-group" as const,
        key: "status",
        value: statusFilter,
        options: [{ value: "active", label: "进行中" }, { value: "done", label: "已完成" }, { value: "archived", label: "已归档" }],
        onChange: (value: string) => onStatusFilterChange(value as WorkStatusFilter),
        ariaLabel: "子任务状态",
      },
      { kind: "option-group" as const, key: "type", value: itemTypeFilter, options: [{ value: "all", label: "全部节点" }, ...WORK_ITEM_TYPE_OPTIONS], onChange: onItemTypeFilterChange, ariaLabel: "节点类型" },
    ] : []),
    ...(activeTab === "reports" ? reportToolbarItems : []),
    ...(activeTab === "tasks" && canCreate ? [
      { kind: "create" as const, key: "create-plan", label: "新增 OKR 计划", active: planCreating, disabled: saving, onClick: onCreatePlan },
      ...(planCreating ? [{
        kind: "action-group" as const,
        key: "plan-save-actions",
        actions: [
          { key: "save-plan", kind: "save" as const, label: planCreating ? "保存 OKR 计划" : "保存计划修改", variant: "primary" as const, disabled: !planDraftTitle.trim(), onClick: onSavePlan },
        ],
      }] : []),
    ] : []),
  ];
}
