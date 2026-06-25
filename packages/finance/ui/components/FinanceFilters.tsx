"use client";

import FilterToolbar from "@workspace/core/ui/FilterToolbar";
import SelectField from "@workspace/core/ui/SelectField";
import type { ColumnDef } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";

const YEAR_OPTIONS = [2024, 2025, 2026].map((year) => ({
  value: String(year),
  label: String(year),
}));

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1}月`,
}));

const LEVEL_OPTIONS = [1, 2, 3, 4, 5].map((level) => ({
  value: String(level),
  label: `${level}级`,
}));

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
  showCompanyYear?: boolean;
  columns?: ColumnDef[];
  visibleColumns?: string[];
  onColumnsChange?: (visible: string[]) => void;
}

export default function FinanceFilters({
  companyFilter = "",
  yearFilter = "",
  monthFilter = "",
  levelFilter = "",
  keyword = "",
  pageSize = 50,
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
  showCompanyYear = true,
  columns,
  visibleColumns,
  onColumnsChange,
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
        <SelectField
          label="公司"
          options={companyOptions}
          value={companyFilter}
          onChange={onCompanyChange}
          placeholder="全部"
          triggerClassName="min-w-32"
        />
      )}
      {showCompanyYear && onYearChange && (
        <SelectField
          label="年度"
          options={YEAR_OPTIONS}
          value={yearFilter}
          onChange={onYearChange}
          placeholder="全部"
          triggerClassName="min-w-32"
        />
      )}
      {showMonth && onMonthChange && (
        <SelectField
          label="月份"
          options={MONTH_OPTIONS}
          value={monthFilter}
          onChange={onMonthChange}
          placeholder="全部"
          triggerClassName="min-w-32"
        />
      )}
      {showLevel && onLevelChange && (
        <SelectField
          label="层级"
          options={LEVEL_OPTIONS}
          value={levelFilter}
          onChange={onLevelChange}
          placeholder="全部"
          triggerClassName="min-w-32"
        />
      )}
      {extra}
    </FilterToolbar>
  );
}
