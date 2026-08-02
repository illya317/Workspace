"use client";

import type { SurfaceToolbarItems } from "@workspace/core/ui";
import { CONTRACT_LIFECYCLE_OPTIONS, type ContractCategoryOption } from "@workspace/administration/types";

interface ContractFiltersProps {
  q: string;
  onQChange: (value: string) => void;
  locationFilter: string;
  onLocationChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  lifecycleStatusFilter: string;
  onLifecycleStatusChange: (value: string) => void;
  locations: string[];
  categories: ContractCategoryOption[];
  pageSize: number;
  onPageSizeChange: (value: number) => void;
  canDownload?: boolean;
  downloading?: boolean;
  onDownload?: () => void;
  onReset: () => void;
}

export default function getContractFilterToolbarItems(props: ContractFiltersProps): SurfaceToolbarItems {
  return [
    {
      kind: "search",
      key: "search",
      value: props.q,
      onChange: props.onQChange,
      placeholder: "搜索编号、名称、主体、经办人...",
    },
    {
      kind: "select",
      key: "location-filter",
      label: "位置",
      value: props.locationFilter,
      onChange: props.onLocationChange,
      placeholder: "全部位置",
      options: props.locations.map((value) => ({ value, label: value })),
    },
    {
      kind: "select",
      key: "category-filter",
      label: "类型",
      value: props.categoryFilter,
      onChange: props.onCategoryChange,
      placeholder: "全部类型",
      options: props.categories.map((category) => ({ value: String(category.id), label: category.name })),
    },
    {
      kind: "select",
      key: "lifecycle-filter",
      label: "合同状态",
      value: props.lifecycleStatusFilter,
      onChange: props.onLifecycleStatusChange,
      placeholder: "全部状态",
      options: CONTRACT_LIFECYCLE_OPTIONS.map((option) => ({ ...option })),
    },
    {
      kind: "action-group",
      key: "reset",
      actions: [{ key: "reset", kind: "reset", label: "重置", onClick: props.onReset }],
    },
    {
      kind: "page-size",
      key: "page-size",
      value: String(props.pageSize),
      options: [20, 50, 100].map((value) => ({ value: String(value), label: `${value}条/页` })),
      onChange: (value) => props.onPageSizeChange(Number(value)),
    },
    ...(props.canDownload && props.onDownload ? [{
      kind: "action-group" as const,
      key: "export",
      actions: [{
        key: "download",
        kind: "download" as const,
        label: "下载全部",
        disabled: props.downloading,
        onClick: props.onDownload,
      }],
    }] : []),
  ];
}
