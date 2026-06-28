"use client";

import type { SurfaceColumnOptionSpec, SurfaceToolbarItems } from "@workspace/core/ui";
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

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200].map((size) => ({
  value: String(size),
  label: `${size}条/页`,
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
  showMonth?: boolean;
  showLevel?: boolean;
  showSearch?: boolean;
  showPageSize?: boolean;
  showCompanyYear?: boolean;
  columns?: SurfaceColumnOptionSpec[];
  visibleColumns?: string[];
  onColumnsChange?: (visible: string[]) => void;
  extraItems?: SurfaceToolbarItems;
}

export function useFinanceFilterToolbarItems({
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
  showMonth = true,
  showLevel = false,
  showSearch = true,
  showPageSize = true,
  showCompanyYear = true,
  columns,
  visibleColumns,
  onColumnsChange,
  extraItems = [],
}: FinanceFiltersProps) {
  const companyOptions = useCompanyOptions();

  const items: SurfaceToolbarItems = [];

  if (showSearch && onKeywordChange) {
    items.push({
      kind: "search",
      key: "search",
      section: "filter",
      value: keyword,
      onChange: onKeywordChange,
      placeholder: "搜索",
    });
  }

  if (showCompanyYear && onCompanyChange) {
    items.push({
      kind: "select",
      key: "company",
      section: "filter",
      label: "公司",
      options: companyOptions,
      value: companyFilter,
      onChange: onCompanyChange,
      placeholder: "全部",
    });
  }

  if (showCompanyYear && onYearChange) {
    items.push({
      kind: "select",
      key: "year",
      section: "filter",
      label: "年度",
      options: YEAR_OPTIONS,
      value: yearFilter,
      onChange: onYearChange,
      placeholder: "全部",
    });
  }

  if (showMonth && onMonthChange) {
    items.push({
      kind: "select",
      key: "month",
      section: "filter",
      label: "月份",
      options: MONTH_OPTIONS,
      value: monthFilter,
      onChange: onMonthChange,
      placeholder: "全部",
    });
  }

  if (showLevel && onLevelChange) {
    items.push({
      kind: "select",
      key: "level",
      section: "filter",
      label: "层级",
      options: LEVEL_OPTIONS,
      value: levelFilter,
      onChange: onLevelChange,
      placeholder: "全部",
    });
  }

  if (columns && onColumnsChange && visibleColumns) {
    items.push({
      kind: "column-toggle",
      key: "columns",
      section: "meta",
      columns,
      visible: visibleColumns,
      onChange: onColumnsChange,
    });
  }

  if (showPageSize && onPageSizeChange) {
    items.push({
      kind: "select",
      key: "page-size",
      section: "meta",
      value: String(pageSize),
      options: PAGE_SIZE_OPTIONS,
      onChange: (value) => onPageSizeChange(Number(value)),
    });
  }

  return [...items, ...extraItems];
}

export default function FinanceFilters(props: FinanceFiltersProps) {
  useFinanceFilterToolbarItems(props);
  return null;
}
