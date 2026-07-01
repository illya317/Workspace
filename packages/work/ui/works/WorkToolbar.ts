"use client";

import type { SurfaceToolbarItem, SurfaceToolbarItems } from "@workspace/core/ui";
import { WORK_ITEM_TYPE_OPTIONS } from "./model";
import type { WorkTargetType } from "./types";

export type WorkStatusFilter = "active" | "done" | "archived";
export type WorkSpaceTypeFilter = "all" | WorkTargetType;

const WORK_SPACE_TYPE_FILTER_OPTIONS: Array<{ value: WorkSpaceTypeFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "personal", label: "个人" },
  { value: "company", label: "公司" },
  { value: "department", label: "部门" },
  { value: "project", label: "项目" },
];

export function createWorkToolbarItems({
  hasSpace,
  sideOpen,
  activeTab,
  canEdit,
  planCreating,
  saving,
  planDraftTitle,
  spaceTypeFilter,
  statusFilter,
  itemTypeFilter,
  planPageToolbarItem,
  reportToolbarItems,
  onOpenDrawer,
  onToggleSide,
  onSpaceTypeFilterChange,
  onStatusFilterChange,
  onItemTypeFilterChange,
  onCreatePlan,
  onSavePlan,
}: {
  hasSpace: boolean;
  sideOpen: boolean;
  activeTab: string;
  canEdit: boolean;
  planCreating: boolean;
  saving: boolean;
  planDraftTitle: string;
  spaceTypeFilter: WorkSpaceTypeFilter;
  statusFilter: WorkStatusFilter;
  itemTypeFilter: string;
  planPageToolbarItem: SurfaceToolbarItem;
  reportToolbarItems: SurfaceToolbarItems;
  onOpenDrawer: () => void;
  onToggleSide: () => void;
  onSpaceTypeFilterChange: (value: WorkSpaceTypeFilter) => void;
  onStatusFilterChange: (value: WorkStatusFilter) => void;
  onItemTypeFilterChange: (value: string) => void;
  onCreatePlan: () => void;
  onSavePlan: () => void;
}): SurfaceToolbarItems {
  if (!hasSpace) return [];
  return [
    { kind: "panel-toggle", key: "mobile-side-toggle", icon: "panel-open", label: "显示工作计划", visibility: "mobile", onClick: onOpenDrawer },
    { kind: "panel-toggle", key: "desktop-side-toggle", icon: sideOpen ? "panel-open" : "panel-close", label: `${sideOpen ? "隐藏" : "显示"}工作计划`, variant: sideOpen ? "primary" : "secondary", visibility: "desktop", onClick: onToggleSide },
    ...(activeTab === "tasks" ? [
      planPageToolbarItem,
      {
        kind: "option-group" as const,
        key: "space-type",
        label: "空间类型",
        value: spaceTypeFilter,
        options: WORK_SPACE_TYPE_FILTER_OPTIONS,
        presentation: "segmented" as const,
        onChange: (value: string) => onSpaceTypeFilterChange(value as WorkSpaceTypeFilter),
        ariaLabel: "空间类型",
      },
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
    ...(activeTab === "tasks" && canEdit ? [
      { kind: "create" as const, key: "create-plan", label: "新增 OKR 计划", active: planCreating, disabled: saving, onClick: onCreatePlan },
      ...(planCreating ? [{
        kind: "action-group" as const,
        key: "plan-save-actions",
        actions: [
          { key: "save-plan", kind: "check" as const, label: planCreating ? "保存 OKR 计划" : "保存计划修改", variant: "primary" as const, disabled: !planDraftTitle.trim(), onClick: onSavePlan },
        ],
      }] : []),
    ] : []),
  ];
}
