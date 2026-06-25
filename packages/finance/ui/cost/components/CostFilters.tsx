"use client";

import { SearchInput, SelectField, Toolbar, type ToolbarItem } from "@workspace/core/ui";
import type { CostFiltersState } from "../types";

interface Props {
  filters: CostFiltersState;
  onChange: (filters: CostFiltersState) => void;
}

export default function CostFilters({ filters, onChange }: Props) {
  const update = (key: keyof CostFiltersState, value: string | number | undefined) => {
    onChange({ ...filters, [key]: value });
  };

  const years = [2026, 2025, 2024];
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const items: ToolbarItem[] = [
    {
      kind: "custom",
      key: "filters",
      section: "filter",
      content: (
        <>
          <SelectField
            label="年份"
            value={filters.year == null ? "" : String(filters.year)}
            onChange={(nextValue) => update("year", nextValue ? parseInt(nextValue) : undefined)}
            placeholder="全部"
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            triggerClassName="min-w-28"
          />
          <SelectField
            label="月份"
            value={filters.month == null ? "" : String(filters.month)}
            onChange={(nextValue) => update("month", nextValue ? parseInt(nextValue) : undefined)}
            placeholder="全部"
            options={months.map((m) => ({ value: String(m), label: `${m}月` }))}
            triggerClassName="min-w-28"
          />
          <SearchInput
            value={filters.productName}
            onChange={(value) => update("productName", value)}
            placeholder="产品名称"
            className="min-w-0 sm:w-60"
          />
          <SearchInput
            value={filters.customerName}
            onChange={(value) => update("customerName", value)}
            placeholder="客户名称"
            className="min-w-0 sm:w-60"
          />
        </>
      ),
    },
  ];

  return <Toolbar items={items} />;
}
