"use client";

import type { SurfaceColumnOptionSpec, SurfaceToolbarItems } from "@workspace/core/ui";

interface ContractFiltersProps {
  q: string;
  onQChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  categories: string[];
  statuses: string[];
  columns: SurfaceColumnOptionSpec[];
  visibleColumns: string[];
  onColumnsChange: (value: string[]) => void;
  onCreate?: () => void;
  onReset: () => void;
}

export default function getContractFilterToolbarItems({
  q, onQChange,
  categoryFilter, onCategoryChange,
  statusFilter, onStatusChange,
  categories, statuses,
  columns, visibleColumns, onColumnsChange,
  onCreate, onReset,
}: ContractFiltersProps): SurfaceToolbarItems {
  return [
    ...(onCreate ? [{
      kind: "create",
      key: "create",
      label: "新增合同",
      onClick: onCreate,
    } as const] : []),
    {
      kind: "search",
      key: "search",
      value: q,
      onChange: onQChange,
      placeholder: "搜索合同名称、签署方、内容...",
    },
    {
      kind: "select",
      key: "category-filter",
      label: "类型",
      value: categoryFilter,
      onChange: onCategoryChange,
      placeholder: "全部",
      options: categories.map((value) => ({ value, label: value })),
    },
    {
      kind: "select",
      key: "status-filter",
      label: "状态",
      value: statusFilter,
      onChange: onStatusChange,
      placeholder: "全部",
      options: statuses.map((value) => ({ value, label: value })),
    },
    {
      kind: "action-group",
      key: "reset",
      actions: [{ key: "reset", kind: "reset", label: "重置", onClick: onReset }],
    },
    {
      kind: "column-toggle",
      key: "columns",
      columns,
      visible: visibleColumns,
      onChange: onColumnsChange,
    },
  ];
}
