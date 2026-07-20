"use client";

import type { SurfaceToolbarItems } from "@workspace/core/ui";
import type { CostFiltersState } from "../types";

interface Props {
  filters: CostFiltersState;
  onChange: (filters: CostFiltersState) => void;
}

export function useCostFilterToolbarItems({ filters, onChange }: Props) {
  const update = (key: keyof CostFiltersState, value: string | number | undefined) => {
    onChange({ ...filters, [key]: value });
  };

  const years = [2026, 2025, 2024];
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const items: SurfaceToolbarItems = [
    {
      kind: "select",
      key: "year",
      label: "年份",
      value: filters.year == null ? "" : String(filters.year),
      onChange: (nextValue) => update("year", nextValue ? parseInt(nextValue) : undefined),
      placeholder: "全部",
      options: years.map((y) => ({ value: String(y), label: String(y) })),
    },
    {
      kind: "select",
      key: "month",
      label: "月份",
      value: filters.month == null ? "" : String(filters.month),
      onChange: (nextValue) => update("month", nextValue ? parseInt(nextValue) : undefined),
      placeholder: "全部",
      options: months.map((m) => ({ value: String(m), label: `${m}月` })),
    },
    {
      kind: "field-filter",
      key: "product",
      fieldKey: "productName",
      onFieldKeyChange: () => {},
      value: filters.productName,
      onValueChange: (value) => update("productName", value),
      fields: [{ value: "productName", label: "产品", valueKind: "text", placeholder: "产品名称" }],
      valueOptions: {},
      placeholder: "产品名称",
    },
    {
      kind: "field-filter",
      key: "customer",
      fieldKey: "customerName",
      onFieldKeyChange: () => {},
      value: filters.customerName,
      onValueChange: (value) => update("customerName", value),
      fields: [{ value: "customerName", label: "客户", valueKind: "text", placeholder: "客户名称" }],
      valueOptions: {},
      placeholder: "客户名称",
    },
  ];

  return items;
}

export default function CostFilters(props: Props) {
  useCostFilterToolbarItems(props);
  return null;
}
