"use client";

import SelectField from "@/app/components/SelectField";
import FilterToolbar from "@/app/components/FilterToolbar";
import { useCompanyOptions } from "@/app/hooks/useCompanyOptions";

// ─── Static Options ───────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────

interface FinanceFiltersProps {
  companyFilter?: string;
  yearFilter?: string;
  monthFilter?: string;
  levelFilter?: string;
  keyword?: string;
  pageSize?: number;
  onCompanyChange?: (value: string) => void;
  onYearChange?: (value: string) => void;
  onMonthChange?: (value: string) => void;
  onLevelChange?: (value: string) => void;
  onKeywordChange?: (value: string) => void;
  onPageSizeChange?: (value: number) => void;
  extra?: React.ReactNode;
  showMonth?: boolean;
  showLevel?: boolean;
  showSearch?: boolean;
  showPageSize?: boolean;
  /** When false, hide the company + year selectors (use a shared parent filter). */
  showCompanyYear?: boolean;
  // ── 右侧显示控制（透传 FilterToolbar）──
  columns?: import("@/app/components/ColumnToggle").ColumnDef[];
  visibleColumns?: string[];
  onColumnsChange?: (visible: string[]) => void;

}

// ─── Component ────────────────────────────────────────────

/**
 * 财务筛选栏 — FilterToolbar 的财务业务薄 wrapper。
 * 预置公司/年度/月份/层级选项，通过 children 传入 FilterToolbar。
 */
export default function FinanceFilters({
  companyFilter = "", yearFilter = "", monthFilter = "", levelFilter = "",
  keyword = "", pageSize = 50,
  onCompanyChange, onYearChange, onMonthChange,
  onLevelChange, onKeywordChange, onPageSizeChange,
  extra,
  showMonth = true, showLevel = false, showSearch = true, showPageSize = true,
  showCompanyYear = true,
  columns, visibleColumns, onColumnsChange,
}: FinanceFiltersProps) {
  const companyOptions = useCompanyOptions();
  return (
    <FilterToolbar
      keyword={showSearch ? keyword : undefined}
      onKeywordChange={showSearch ? onKeywordChange : undefined}
      pageSize={showPageSize ? pageSize : undefined}
      onPageSizeChange={showPageSize ? onPageSizeChange : undefined}
      columns={columns}
      visibleColumns={visibleColumns}
      onColumnsChange={onColumnsChange}
    >
      {showCompanyYear && onCompanyChange && (
        <SelectField label="公司" options={companyOptions} value={companyFilter} onChange={onCompanyChange} placeholder="全部" />
      )}
      {showCompanyYear && onYearChange && (
        <SelectField label="年度" options={YEAR_OPTIONS} value={yearFilter} onChange={onYearChange} placeholder="全部" />
      )}

      {showMonth && onMonthChange && (
        <SelectField label="月份" options={MONTH_OPTIONS} value={monthFilter} onChange={onMonthChange} placeholder="全部" />
      )}

      {showLevel && onLevelChange && (
        <SelectField label="层级" options={LEVEL_OPTIONS} value={levelFilter} onChange={onLevelChange} placeholder="全部" />
      )}

      {extra}
    </FilterToolbar>
  );
}
