"use client";

import type { ReactNode } from "react";
import { Toolbar, type ToolbarItem } from "./Toolbar";
import type { ColumnDef } from "./ColumnToggle";
import type { ToolbarAction } from "./ActionControls";
import type { ToolbarOption } from "./ToolbarOptionGroup";

export interface FilterToolbarProps {
  keyword?: string;
  onKeywordChange?: (value: string) => void;
  searchScope?: "full" | readonly string[];
  searchPlaceholder?: string;
  children?: ReactNode;
  columns?: ColumnDef[];
  visibleColumns?: string[];
  onColumnsChange?: (visible: string[]) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (value: number) => void;
  meta?: ReactNode;
  onReset?: () => void;
  resetLabel?: ReactNode;
  primaryAction?: ToolbarAction;
  optionGroups?: Array<{
    value: string;
    options: ToolbarOption[];
    onChange: (value: string) => void;
    ariaLabel?: string;
  }>;
  secondaryActions?: ToolbarAction[];
  extraRight?: ReactNode;
  searchClassName?: string;
  className?: string;
}

export default function FilterToolbar({
  keyword = "",
  onKeywordChange,
  searchScope = "full",
  searchPlaceholder = "搜索",
  children,
  columns,
  visibleColumns,
  onColumnsChange,
  pageSize = 50,
  pageSizeOptions = [20, 50, 100, 200],
  onPageSizeChange,
  meta,
  onReset,
  resetLabel = "重置",
  primaryAction,
  optionGroups = [],
  secondaryActions = [],
  extraRight,
  searchClassName,
  className = "",
}: FilterToolbarProps) {
  const sizeOptions = pageSizeOptions.map((size) => ({
    value: String(size),
    label: `${size}条/页`,
  }));
  const resetText = typeof resetLabel === "string" ? resetLabel : "清除筛选";

  const items: ToolbarItem[] = [];

  if (primaryAction) {
    items.push({
      kind: "button",
      key: "primary",
      section: "filter",
      label: primaryAction.label,
      variant: primaryAction.variant ?? "primary",
      type: primaryAction.type,
      disabled: primaryAction.disabled,
      onClick: primaryAction.onClick,
    });
  }

  if (onKeywordChange) {
    items.push({
      kind: "search",
      key: "search",
      section: "filter",
      value: keyword,
      onChange: onKeywordChange,
      placeholder: searchPlaceholder,
      scope: searchScope,
      className: searchClassName ?? "min-w-0",
    });
  }

  optionGroups.forEach((group, index) => {
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

  if (children) {
    items.push({ kind: "custom", key: "children", section: "filter", content: children });
  }

  if (onReset) {
    items.push({
      kind: "button",
      key: "reset",
      section: "filter",
      label: resetText,
      onClick: onReset,
    });
  }

  secondaryActions.forEach((action, index) => {
    items.push({
      kind: "button",
      key: `secondary-${index}`,
      section: "filter",
      label: action.label,
      variant: action.variant,
      type: action.type,
      disabled: action.disabled,
      onClick: action.onClick,
    });
  });

  if (meta) {
    items.push({ kind: "text", key: "meta", section: "meta", content: meta });
  }

  if (columns && onColumnsChange && visibleColumns) {
    items.push({
      kind: "column-toggle",
      key: "columns",
      section: "meta",
      columns,
      visible: visibleColumns,
      onChange: onColumnsChange,
    });
  }

  if (onPageSizeChange) {
    items.push({
      kind: "select",
      key: "page-size",
      section: "meta",
      value: String(pageSize),
      options: sizeOptions,
      onChange: (value) => onPageSizeChange(Number(value)),
      triggerClassName: "!w-[6.5rem] !min-w-[6.5rem]",
    });
  }

  if (extraRight) {
    items.push({ kind: "custom", key: "extra-right", section: "meta", content: extraRight });
  }

  return <Toolbar items={items} className={className} />;
}
