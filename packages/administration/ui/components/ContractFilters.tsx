"use client";

import type { SurfaceToolbarItems } from "@workspace/core/ui";

interface ContractFiltersProps {
  q: string;
  onQChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  categories: string[];
  statuses: string[];
  pageSize: number;
  onPageSizeChange: (value: number) => void;
  canDownload?: boolean;
  downloading?: boolean;
  onDownload?: () => void;
  onReset: () => void;
}

export default function getContractFilterToolbarItems({
  q, onQChange,
  categoryFilter, onCategoryChange,
  statusFilter, onStatusChange,
  categories, statuses,
  pageSize, onPageSizeChange,
  canDownload = false, downloading = false, onDownload,
  onReset,
}: ContractFiltersProps): SurfaceToolbarItems {
  return [
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
      kind: "page-size",
      key: "page-size",
      value: String(pageSize),
      options: [20, 50, 100].map((value) => ({ value: String(value), label: `${value}条/页` })),
      onChange: (value) => onPageSizeChange(Number(value)),
    },
    ...(canDownload && onDownload ? [{
      kind: "action-group" as const,
      key: "export",
      actions: [{
        key: "download",
        kind: "download" as const,
        label: "下载全部",
        disabled: downloading,
        onClick: onDownload,
      }],
    }] : []),
  ];
}
