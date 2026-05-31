"use client";

import FilterBar from "@/app/components/FilterBar";
import SelectField from "@/app/components/SelectField";

// ─── Options ──────────────────────────────────────────────

const COMPANY_OPTIONS = [
  { value: "01", label: "丰华生物" },
  { value: "02", label: "丰华天力通" },
  { value: "03", label: "丰华悦通" },
  { value: "04", label: "丰华制药" },
  { value: "05", label: "加拿大" },
  { value: "06", label: "上海悦通" },
];

const YEAR_OPTIONS = [2024, 2025, 2026].map((y) => ({
  value: String(y),
  label: String(y),
}));

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}月`,
}));

const LEVEL_OPTIONS = [1, 2, 3, 4, 5].map((l) => ({
  value: String(l),
  label: `${l}级`,
}));

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200].map((s) => ({
  value: String(s),
  label: `${s}条/页`,
}));

// ─── Props ────────────────────────────────────────────────

interface FinanceFiltersProps {
  companyFilter: string;
  yearFilter: string;
  monthFilter?: string;
  levelFilter?: string;
  keyword?: string;
  pageSize?: number;
  total?: number;
  onCompanyChange: (value: string) => void;
  onYearChange: (value: string) => void;
  onMonthChange?: (value: string) => void;
  onLevelChange?: (value: string) => void;
  onKeywordChange?: (value: string) => void;
  onPageSizeChange?: (value: number) => void;
  extra?: React.ReactNode;
  showMonth?: boolean;
  showLevel?: boolean;
  showSearch?: boolean;
  showPageSize?: boolean;
}

// ─── Component ────────────────────────────────────────────

/**
 * 财务通用筛选栏。
 * 内部用 FilterBar + SelectField 组合，对外保留财务业务语义的 props。
 *
 * 典型组合：
 *   FinanceFilters + ColumnToggle + DataTable + Pagination
 */
export default function FinanceFilters({
  companyFilter,
  yearFilter,
  monthFilter = "",
  levelFilter = "",
  keyword = "",
  pageSize = 50,
  total,
  onCompanyChange,
  onYearChange,
  onMonthChange,
  onLevelChange,
  onKeywordChange,
  onPageSizeChange,
  extra,
  showMonth = true,
  showLevel = false,
  showSearch = true,
  showPageSize = true,
}: FinanceFiltersProps) {
  return (
    <FilterBar>
      {showSearch && onKeywordChange && (
        <input
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder="搜索..."
          className="rounded border border-gray-200 px-2 py-1 text-xs w-36 focus:border-emerald-400 focus:outline-none"
        />
      )}

      <SelectField
        label="公司"
        options={COMPANY_OPTIONS}
        value={companyFilter}
        onChange={onCompanyChange}
        placeholder="全部"
      />

      <SelectField
        label="年度"
        options={YEAR_OPTIONS}
        value={yearFilter}
        onChange={onYearChange}
        placeholder="全部"
      />

      {showMonth && onMonthChange && (
        <SelectField
          label="月份"
          options={MONTH_OPTIONS}
          value={monthFilter}
          onChange={onMonthChange}
          placeholder="全部"
        />
      )}

      {showLevel && onLevelChange && (
        <SelectField
          label="层级"
          options={LEVEL_OPTIONS}
          value={levelFilter}
          onChange={onLevelChange}
          placeholder="全部"
        />
      )}

      {extra}

      {showPageSize && onPageSizeChange && (
        <SelectField
          options={PAGE_SIZE_OPTIONS}
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
        />
      )}

      <div className="flex-1" />

      {total !== undefined && (
        <span className="text-[11px] text-gray-400">共 {total} 条</span>
      )}
    </FilterBar>
  );
}
