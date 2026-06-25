"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { IconActionButton } from "./ActionControls";
import type { ColumnDef } from "./ColumnToggle";
import EditToolbar, { type EditToolbarProps } from "./EditToolbar";
import { Toolbar, type ToolbarItem } from "./Toolbar";

export type PageToolbarFeature =
  | "title"
  | "view"
  | "search"
  | "filter"
  | "action"
  | "edit"
  | "meta"
  | "columns"
  | "pageSize";

export interface PageToolbarOptionGroup {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export interface PageToolbarAction {
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  kind?: "button" | "icon";
  icon?: Parameters<typeof IconActionButton>[0]["kind"];
}

export interface PageToolbarProps {
  title?: ReactNode;
  features?: PageToolbarFeature[];
  onCreate?: () => void;
  createLabel?: string;
  onToggleList?: () => void;
  listVisible?: boolean;
  search?: {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    scope?: "full" | readonly string[];
  };
  optionGroups?: PageToolbarOptionGroup[];
  filters?: ReactNode;
  actions?: PageToolbarAction[];
  editProps?: EditToolbarProps;
  meta?: ReactNode;
  pageSize?: {
    value?: number;
    options?: number[];
    onChange?: (value: number) => void;
  };
  columns?: {
    defs: ColumnDef[];
    visible: string[];
    onChange: (visible: string[]) => void;
  };
  extra?: ReactNode;
  onSubmit?: () => void;
  className?: string;
}

function useManagedState<T>(external?: T, onChange?: (value: T) => void, initial?: T | (() => T)) {
  const [internal, setInternal] = useState<T | undefined>(initial);
  const isControlled = external !== undefined;
  const value = isControlled ? external : internal!;
  const setValue = (next: T) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };
  return [value, setValue] as const;
}

const DEFAULT_FEATURES: PageToolbarFeature[] = [
  "title",
  "view",
  "search",
  "filter",
  "action",
  "edit",
  "meta",
  "columns",
  "pageSize",
];

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "名称", required: true },
  { key: "status", label: "状态", defaultVisible: true },
  { key: "amount", label: "金额", defaultVisible: true },
  { key: "owner", label: "负责人" },
  { key: "updatedAt", label: "更新时间" },
];

export default function PageToolbar({
  title = "页面标题",
  features = DEFAULT_FEATURES,
  onCreate,
  createLabel = "新建",
  onToggleList,
  listVisible,
  search,
  optionGroups,
  filters,
  actions,
  editProps,
  meta,
  pageSize,
  columns,
  extra,
  onSubmit,
  className = "",
}: PageToolbarProps) {
  const featureSet = useMemo(() => new Set(features), [features]);

  const [keyword, setKeyword] = useManagedState(search?.value, search?.onChange, "");
  const [size, setSize] = useManagedState(pageSize?.value, pageSize?.onChange, 50);
  const [visibleColumns, setVisibleColumns] = useManagedState(
    columns?.visible,
    columns?.onChange,
    () => columns?.defs
      ? columns.defs.filter((column) => column.defaultVisible || column.required).map((column) => column.key)
      : DEFAULT_COLUMNS.filter((column) => column.defaultVisible || column.required).map((column) => column.key),
  );

  const sizeOptions = useMemo(
    () => (pageSize?.options ?? [20, 50, 100, 200]).map((value) => ({ value: String(value), label: `${value}条/页` })),
    [pageSize?.options],
  );

  const items: ToolbarItem[] = [];

  if (featureSet.has("title") && title) {
    items.push({ kind: "custom", key: "title", section: "view", content: <span className="text-base font-semibold text-slate-900">{title}</span> });
  }

  if (featureSet.has("view") && (onToggleList || onCreate)) {
    if (onToggleList) {
      items.push({
        kind: "icon-button",
        key: "toggle-list",
        section: "view",
        icon: listVisible ? "panel-open" : "panel-close",
        label: listVisible ? "隐藏列表" : "显示列表",
        variant: listVisible ? "primary" : "secondary",
        onClick: onToggleList,
      });
    }
    if (onCreate) {
      items.push({
        kind: "button",
        key: "create",
        section: "view",
        label: createLabel,
        variant: "primary",
        onClick: onCreate,
      });
    }
  }

  if (featureSet.has("search")) {
    items.push({
      kind: "search",
      key: "search",
      section: "filter",
      value: keyword,
      onChange: setKeyword,
      placeholder: search?.placeholder ?? "搜索...",
      scope: search?.scope,
    });
  }

  if (featureSet.has("filter")) {
    optionGroups?.forEach((group, index) => {
      items.push({
        kind: "option-group",
        key: `option-group-${index}`,
        section: "filter",
        value: group.value,
        options: group.options,
        onChange: group.onChange,
        ariaLabel: group.ariaLabel,
      });
    });
    if (filters) {
      items.push({ kind: "custom", key: "filters", section: "filter", content: filters });
    }
  }

  if (featureSet.has("action") && actions) {
    actions.forEach((action, index) => {
      if (action.kind === "icon" && action.icon) {
        items.push({
          kind: "icon-button",
          key: `action-${index}`,
          section: "action",
          icon: action.icon,
          label: action.label,
          variant: action.variant,
          onClick: action.onClick,
        });
      } else {
        items.push({
          kind: "button",
          key: `action-${index}`,
          section: "action",
          label: action.label,
          variant: action.variant ?? "secondary",
          onClick: action.onClick,
        });
      }
    });
  }

  if (featureSet.has("edit") && editProps) {
    items.push({ kind: "custom", key: "edit", section: "edit", content: <EditToolbar {...editProps} /> });
  }

  if (featureSet.has("meta") && meta) {
    items.push({ kind: "text", key: "meta", section: "meta", content: meta });
  }

  if (featureSet.has("columns")) {
    const columnDefs = columns?.defs ?? DEFAULT_COLUMNS;
    items.push({
      kind: "column-toggle",
      key: "columns",
      section: "meta",
      columns: columnDefs,
      visible: visibleColumns,
      onChange: setVisibleColumns,
    });
  }

  if (featureSet.has("pageSize")) {
    items.push({
      kind: "select",
      key: "page-size",
      section: "meta",
      value: String(size),
      options: sizeOptions,
      onChange: (value) => setSize(Number(value)),
      triggerClassName: "!w-[6.5rem] !min-w-[6.5rem]",
    });
  }

  if (extra) {
    items.push({ kind: "custom", key: "extra", section: "meta", content: extra });
  }

  if (items.length === 0) {
    return null;
  }

  return <Toolbar items={items} className={className} onSubmit={onSubmit} />;
}
