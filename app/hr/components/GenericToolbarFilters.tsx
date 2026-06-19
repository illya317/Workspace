"use client";

import OptionPicker from "./OptionPicker";
import type { FilterConfig } from "../types";

interface GenericToolbarFiltersProps {
  filters: FilterConfig[];
  filterValues: Record<string, unknown>;
  onFilterChange: (key: string, value: string) => void;
  onShowAdvancedFilters: () => void;
  hasAdvancedFilters?: boolean;
  canCreate: boolean;
  onCreate: () => void;
}

export default function GenericToolbarFilters({
  filters,
  filterValues,
  onFilterChange,
  onShowAdvancedFilters,
  hasAdvancedFilters = true,
  canCreate,
  onCreate,
}: GenericToolbarFiltersProps) {
  return (
    <>
      {filters?.map((f) =>
        f.type === "boolean" ? (
          <OptionPicker
            key={f.key}
            value={(filterValues[f.key] as string) ?? ""}
            onChange={(value) => onFilterChange(f.key, value ?? "")}
            options={[
              { label: "是", value: "true" },
              { label: "否", value: "false" },
            ]}
            placeholder={f.label}
            buttonClassName="rounded-md border border-gray-300 px-3 py-2 text-left text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
          />
        ) : f.type === "select" && f.options ? (
          <OptionPicker
            key={f.key}
            value={(filterValues[f.key] as string) ?? ""}
            onChange={(value) => onFilterChange(f.key, value ?? "")}
            options={f.options}
            placeholder={f.label}
            buttonClassName="rounded-md border border-gray-300 px-3 py-2 text-left text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
          />
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

      {hasAdvancedFilters && (
        <button
          onClick={onShowAdvancedFilters}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          筛选
        </button>
      )}

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
