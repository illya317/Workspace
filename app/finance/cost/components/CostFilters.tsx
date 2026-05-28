"use client";

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

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">年份</label>
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          value={filters.year ?? ""}
          onChange={(e) => update("year", e.target.value ? parseInt(e.target.value) : undefined)}
        >
          <option value="">全部</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">月份</label>
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          value={filters.month ?? ""}
          onChange={(e) => update("month", e.target.value ? parseInt(e.target.value) : undefined)}
        >
          <option value="">全部</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}月
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">产品</label>
        <input
          type="text"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          placeholder="产品名称"
          value={filters.productName}
          onChange={(e) => update("productName", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">客户</label>
        <input
          type="text"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          placeholder="客户名称"
          value={filters.customerName}
          onChange={(e) => update("customerName", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">业务员</label>
        <input
          type="text"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          placeholder="业务员"
          value={filters.salesperson}
          onChange={(e) => update("salesperson", e.target.value)}
        />
      </div>
    </div>
  );
}
