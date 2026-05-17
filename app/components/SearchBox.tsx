"use client";

import { useSearch } from "@/lib/useSearch";
import type { SearchConfig, SearchFilters } from "@/lib/useSearch";

// ─── Props ────────────────────────────────────────────────

interface Props<T = any> {
  /** Search configuration, passed directly to useSearch */
  config: SearchConfig<T>;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Called when user clicks a result */
  onSelect: (item: T) => void;
  /** Custom result row renderer */
  renderItem: (item: T) => React.ReactNode;
  /** Text shown while loading */
  loadingText?: string;
  /** Text shown when no results */
  emptyText?: string;
  /** Optional extra elements after filter row (e.g. resource selector) */
  extraFilters?: React.ReactNode;
  /** Input className override */
  inputClassName?: string;
  /** Dropdown max height */
  maxHeight?: string;
}

// ─── Component ────────────────────────────────────────────

export default function SearchBox<T = any>({
  config,
  placeholder = "搜索...",
  onSelect,
  renderItem,
  loadingText = "搜索中...",
  emptyText = "无匹配结果",
  extraFilters,
  inputClassName,
  maxHeight = "max-h-48",
}: Props<T>) {
  const {
    query, setQuery,
    results, loading,
    showDropdown, setShowDropdown,
    filterValues, setFilter, clearFilters,
  } = useSearch<T>(config);

  const hasFilters = config.filters && Object.values(config.filters).some(Boolean);
  const opts = config.filterOptions || {};

  return (
    <div className="space-y-2">
      {/* Filter row */}
      {hasFilters && (
        <div className="flex flex-wrap gap-2">
          {config.filters?.company && (
            <select
              value={filterValues.company || ""}
              onChange={(e) => setFilter("company", e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
            >
              <option value="">全部公司</option>
              {(opts.companies || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {config.filters?.department && (
            <select
              value={filterValues.department || ""}
              onChange={(e) => setFilter("department", e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
            >
              <option value="">全部部门</option>
              {(opts.departments || []).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
          {config.filters?.project && (
            <select
              value={filterValues.project || ""}
              onChange={(e) => setFilter("project", e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
            >
              <option value="">全部项目</option>
              {(opts.projects || []).map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          )}
          {config.filters?.position && (
            <select
              value={filterValues.position || ""}
              onChange={(e) => setFilter("position", e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
            >
              <option value="">全部岗位</option>
              {(opts.positions || []).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
          {extraFilters}
        </div>
      )}

      {/* Search input + dropdown */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder={placeholder}
          className={inputClassName || "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"}
        />
        {loading && (
          <span className="absolute right-3 top-2.5 text-xs text-gray-400">{loadingText}</span>
        )}
        {showDropdown && query.trim() && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
            <div className={`${maxHeight} overflow-y-auto`}>
              {results.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-gray-400">{emptyText}</p>
              ) : (
                results.map((item, idx) => (
                  <div
                    key={(item as any).rowId ?? (item as any).id ?? (item as any).name ?? idx}
                    onMouseDown={() => { onSelect(item); setShowDropdown(false); }}
                    className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-emerald-50"
                  >
                    {renderItem(item)}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
