"use client";

import type { SurfaceToolbarItem, SurfaceToolbarItems } from "@workspace/core/ui";
import { WORK_ITEM_TYPE_OPTIONS } from "./model";

export type WorkStatusFilter = "active" | "done" | "archived";

export function createWorkToolbarItems({
  hasSpace,
  sideOpen,
  activeTab,
  canEdit,
  planCreating,
  planEditing,
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
  onCreatePlan,
  onCancelPlanEdit,
  onSavePlan,
}: {
  hasSpace: boolean;
  sideOpen: boolean;
  activeTab: string;
  canEdit: boolean;
  planCreating: boolean;
  planEditing: boolean;
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
  onCreatePlan: () => void;
  onCancelPlanEdit: () => void;
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
        key: "status",
        section: "filter" as const,
        value: statusFilter,
        options: [{ value: "active", label: "进行中" }, { value: "done", label: "已完成" }, { value: "archived", label: "已归档" }],
        onChange: (value: string) => onStatusFilterChange(value as WorkStatusFilter),
        ariaLabel: "子任务状态",
      },
      { kind: "option-group" as const, key: "type", section: "filter" as const, value: itemTypeFilter, options: [{ value: "all", label: "全部节点" }, ...WORK_ITEM_TYPE_OPTIONS], onChange: onItemTypeFilterChange, ariaLabel: "节点类型" },
    ] : []),
    ...(activeTab === "reports" ? reportToolbarItems : []),
    ...(activeTab === "tasks" && canEdit ? [
      { kind: "create" as const, key: "create-plan", label: "新增 OKR 计划", active: planCreating, disabled: saving || planEditing, onClick: onCreatePlan },
      ...(planCreating ? [{
        kind: "action-group" as const,
        key: "plan-save-actions",
        section: "edit" as const,
        actions: [
          { key: "cancel-plan", kind: "cancel" as const, label: "取消计划编辑", onClick: onCancelPlanEdit },
          { key: "save-plan", kind: "check" as const, label: planCreating ? "保存 OKR 计划" : "保存计划修改", variant: "primary" as const, disabled: !planDraftTitle.trim(), onClick: onSavePlan },
        ],
      }] : []),
    ] : []),
  ];
}
