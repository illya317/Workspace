"use client";

import type { FilterConfig } from "../types";

interface GenericToolbarFiltersProps {
  filters: FilterConfig[];
  filterValues: Record<string, unknown>;
  onFilterChange: (key: string, value: string) => void;
  onShowAdvancedFilters: () => void;
  canCreate: boolean;
  onCreate: () => void;
}

export default function GenericToolbarFilters({
  filters,
  filterValues,
  onFilterChange,
  onShowAdvancedFilters,
  canCreate,
  onCreate,
}: GenericToolbarFiltersProps) {
  return (
    <>
      {filters?.map((f) =>
        f.type === "boolean" ? (
          <select
            key={f.key}
            value={(filterValues[f.key] as string) ?? ""}
            onChange={(e) => onFilterChange(f.key, e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
          >
            <option value="">{f.label}</option>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        ) : f.type === "select" && f.options ? (
          <select
            key={f.key}
            value={(filterValues[f.key] as string) ?? ""}
            onChange={(e) => onFilterChange(f.key, e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
          >
            <option value="">{f.label}</option>
            {f.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <input
            key={f.key}
            type="text"
            value={(filterValues[f.key] as string) ?? ""}
            onChange={(e) => onFilterChange(f.key, e.target.value)}
            placeholder={f.label}
            className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-400 focus:outline-none"
          />
        )
      )}

      <button
        onClick={onShowAdvancedFilters}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
      >
        筛选
      </button>

      {canCreate && (
        <button
          onClick={onCreate}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
        >
          新建
        </button>
      )}
    </>
  );
}
