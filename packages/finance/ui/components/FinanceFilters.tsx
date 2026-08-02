"use client";

import type { SurfaceColumnOptionSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";
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
  periodKind?: StatementPeriodKind;
  levelFilter?: string;
  keyword?: string;
  pageSize?: number;
  onCompanyChange?: (value: string) => void;
  onYearChange?: (value: string) => void;
  onMonthChange?: (value: string) => void;
  onPeriodKindChange?: (value: StatementPeriodKind) => void;
  onLevelChange?: (value: string) => void;
  onKeywordChange?: (value: string) => void;
  onPageSizeChange?: (value: number) => void;
  showMonth?: boolean;
  showLevel?: boolean;
  showSearch?: boolean;
  showPageSize?: boolean;
  showCompanyYear?: boolean;
  allowPeriodWithoutCompany?: boolean;
  columns?: SurfaceColumnOptionSpec[];
  visibleColumns?: string[];
  onColumnsChange?: (visible: string[]) => void;
  extraItems?: SurfaceToolbarItems;
}

export function useFinanceFilterToolbarItems({
  companyFilter = "",
  yearFilter = "",
  monthFilter = "",
  periodKind,
  levelFilter = "",
  keyword = "",
  pageSize = 50,
  onCompanyChange,
  onYearChange,
  onMonthChange,
  onPeriodKindChange,
  onLevelChange,
  onKeywordChange,
  onPageSizeChange,
  showMonth = true,
  showLevel = false,
  showSearch = true,
  showPageSize = true,
  showCompanyYear = true,
  allowPeriodWithoutCompany = false,
  columns,
  visibleColumns,
  onColumnsChange,
  extraItems = [],
}: FinanceFiltersProps) {
  const allCompanyOptions = useCompanyOptions();
  const periods = useFinancePeriodDataset();
  const companiesWithPeriods = new Set(periods.map((period) => period.companyCode));
  const companyOptions = allCompanyOptions.filter((option) => companiesWithPeriods.has(option.value));
  const scopedPeriods = companyFilter
    ? periods.filter((period) => period.companyCode === companyFilter)
    : allowPeriodWithoutCompany
      ? periods
      : [];
  const companyPeriods = uniquePeriodPoints(scopedPeriods);

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
        const valuePeriods = periods.filter((period) => period.companyCode === value);
        const initial = latestAvailableFinancePeriod(periodKind
          ? availablePeriodsForKind(valuePeriods, periodKind)
          : valuePeriods);
        if (initial) {
          onYearChange?.(String(initial.year));
          onMonthChange?.(String(initial.month));
        }
      },
      placeholder: "全部",
    });
  }

  if (showCompanyYear && onYearChange) {
    const precision = periodKind ?? (showMonth && onMonthChange ? "month" as const : "year" as const);
    const selectedYear = Number(yearFilter);
    const selectedMonth = precision === "year" ? 12 : Number(monthFilter);
    const navigationPeriods = periodKind
      ? availablePeriodsForKind(companyPeriods, periodKind)
      : precision === "month"
        ? companyPeriods
        : [...new Set(companyPeriods.map((period) => period.year))].map((year) => ({
            companyCode: companyFilter,
            year,
            month: 12,
          }));
    const periodChange = (nextYear: number, nextMonth: number) => {
      onYearChange(String(nextYear));
      if (periodKind || precision === "month") onMonthChange?.(String(nextMonth));
    };
    if (periodKind && onPeriodKindChange && onMonthChange) {
      items.push({
        kind: "option-group",
        key: "period-kind",
        value: periodKind,
        options: [
          { value: "year", label: "年", disabled: availablePeriodsForKind(companyPeriods, "year").length === 0 },
          { value: "quarter", label: "季度", disabled: availablePeriodsForKind(companyPeriods, "quarter").length === 0 },
          { value: "month", label: "月", disabled: companyPeriods.length === 0 },
        ],
        onChange: (value) => {
          const nextKind = value as StatementPeriodKind;
          const nextPeriods = availablePeriodsForKind(companyPeriods, nextKind);
          const desiredMonth = nextKind === "year"
            ? 12
            : nextKind === "quarter"
              ? Math.ceil(Number(monthFilter) / 3) * 3
              : Number(monthFilter);
          const nextPeriod = nextPeriods.find((candidate) => (
            candidate.year === Number(yearFilter) && candidate.month === desiredMonth
          )) ?? latestAvailableFinancePeriod(nextPeriods);
          onPeriodKindChange(nextKind);
          if (nextPeriod) periodChange(nextPeriod.year, nextPeriod.month);
        },
        ariaLabel: "期间粒度",
        presentation: "accordion",
        accordionTrigger: "active",
      });
    }
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
          if (!periodKind && precision === "year") {
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

function availablePeriodsForKind(
  periods: Array<{ companyCode: string; year: number; month: number }>,
  kind: StatementPeriodKind,
) {
  if (kind === "year") return periods.filter((period) => period.month === 12);
  if (kind === "quarter") return periods.filter((period) => period.month % 3 === 0);
  return periods;
}

function uniquePeriodPoints(
  periods: Array<{ companyCode: string; year: number; month: number }>,
) {
  const unique = new Map<string, (typeof periods)[number]>();
  for (const period of periods) unique.set(`${period.year}:${period.month}`, period);
  return [...unique.values()];
}
