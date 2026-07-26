"use client";

import type { SurfaceColumnOptionSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";
import {
  consolidationPeriodLabel,
  consolidationPeriodValue,
  parseConsolidationPeriod,
} from "../statements/consolidation-period";
import { adjacentAvailableFinancePeriod, latestAvailableFinancePeriod } from "../statements/finance-period-dataset";
import { useFinancePeriodDataset } from "../statements/useFinancePeriodDataset";

const LEVEL_OPTIONS = [1, 2, 3, 4, 5].map((level) => ({
  value: String(level),
  label: `${level}级`,
}));

const PAGE_SIZE_OPTIONS = [20, 50, 100].map((size) => ({
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
  const allCompanyOptions = useCompanyOptions();
  const periods = useFinancePeriodDataset();
  const companiesWithPeriods = new Set(periods.map((period) => period.companyCode));
  const companyOptions = allCompanyOptions.filter((option) => companiesWithPeriods.has(option.value));

  const items: SurfaceToolbarItems = [];

  if (showSearch && onKeywordChange) {
    items.push({
      kind: "search",
      key: "search",
      value: keyword,
      onChange: onKeywordChange,
      placeholder: "搜索",
    });
  }

  if (showCompanyYear && onCompanyChange) {
    items.push({
      kind: "select",
      key: "company",
      label: "公司",
      options: companyOptions,
      value: companyFilter,
      onChange: (value) => {
        onCompanyChange(value);
        const initial = latestAvailableFinancePeriod(periods.filter((period) => period.companyCode === value));
        if (initial) {
          onYearChange?.(String(initial.year));
          onMonthChange?.(String(initial.month));
        }
      },
      placeholder: "全部",
    });
  }

  if (showCompanyYear && onYearChange) {
    const precision = showMonth && onMonthChange ? "month" as const : "year" as const;
    const selectedYear = Number(yearFilter);
    const selectedMonth = precision === "month" ? Number(monthFilter) : 12;
    const companyPeriods = periods.filter((period) => period.companyCode === companyFilter);
    const navigationPeriods = precision === "month"
      ? companyPeriods
      : [...new Set(companyPeriods.map((period) => period.year))].map((year) => ({
          companyCode: companyFilter,
          year,
          month: 12,
        }));
    const periodChange = (nextYear: number, nextMonth: number) => {
      onYearChange(String(nextYear));
      if (precision === "month") onMonthChange?.(String(nextMonth));
    };
    items.push({
      kind: "period",
      key: "accounting-period",
      mode: "nav",
      label: Number.isInteger(selectedYear) && selectedYear > 0
        ? consolidationPeriodLabel(selectedYear, selectedMonth, precision)
        : "选择期间",
      onPrevious: () => {
        const next = adjacentAvailableFinancePeriod(navigationPeriods, { year: selectedYear, month: selectedMonth }, -1);
        if (next) periodChange(next.year, next.month);
      },
      onNext: () => {
        const next = adjacentAvailableFinancePeriod(navigationPeriods, { year: selectedYear, month: selectedMonth }, 1);
        if (next) periodChange(next.year, next.month);
      },
      picker: Number.isInteger(selectedYear) && selectedYear > 0 ? {
        precision,
        value: consolidationPeriodValue(selectedYear, selectedMonth, precision),
        onChange: (value) => {
          const next = parseConsolidationPeriod(value, precision);
          if (!next) return;
          if (precision === "year") {
            const yearPeriod = companyPeriods.find((period) => period.year === next.year);
            if (yearPeriod) periodChange(yearPeriod.year, yearPeriod.month);
            return;
          }
          if (companyPeriods.some((period) => period.year === next.year && period.month === next.month)) {
            periodChange(next.year, next.month);
          }
        },
        ariaLabel: "选择会计期间",
      } : undefined,
      disabled: companyPeriods.length === 0,
    });
  }

  if (showLevel && onLevelChange) {
    items.push({
      kind: "select",
      key: "level",
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
      columns,
      visible: visibleColumns,
      onChange: onColumnsChange,
    });
  }

  if (showPageSize && onPageSizeChange) {
    items.push({
      kind: "page-size",
      key: "page-size",
      value: String(pageSize),
      options: PAGE_SIZE_OPTIONS,
      onChange: (value) => onPageSizeChange(Number(value)),
    });
  }

  return [...items, ...extraItems];
}
