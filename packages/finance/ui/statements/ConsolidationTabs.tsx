"use client";

import {
  PageSurface,
  createAnalysisSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { ConsolidationOverview } from "@workspace/finance/types";
import { useMemo, useState } from "react";

import { adjustmentComparisonColumns } from "./consolidation-columns";
import {
  consolidationPeriodLabel,
  consolidationPeriodValue,
  parseConsolidationPeriod,
  shiftConsolidationPeriod,
  type ConsolidationPeriodKind,
} from "./consolidation-period";
import type {
  ConsolidationCapabilities,
} from "./statement-ui-types";
import { useConsolidationCommands } from "./useConsolidationCommands";

export interface ConsolidationTabProps {
  capabilities: ConsolidationCapabilities;
  data: ConsolidationOverview | null;
  error: string | null;
  loading: boolean;
  year: number | null;
  month: number | null;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onRefresh: () => void;
  navigation: PageSurfaceTabBarSpec;
}

export function usePeriodToolbar(props: ConsolidationTabProps): SurfaceToolbarItems {
  const { error, loading, month, onMonthChange, onRefresh, onYearChange, year } = props;
  const [periodKind, setPeriodKind] = useState<ConsolidationPeriodKind>("month");
  return useMemo(() => {
    const periodValue = year === null || month === null ? null : consolidationPeriodValue(year, month, periodKind);
    const changePeriod = (nextYear: number, nextMonth: number) => {
      onYearChange(nextYear);
      onMonthChange(nextMonth);
    };
    return [
      {
        kind: "option-group" as const,
        key: "period-kind",
        value: periodKind,
        options: [
          { value: "year", label: "年" },
          { value: "quarter", label: "季度" },
          { value: "month", label: "月" },
        ],
        onChange: (value: string) => {
          const nextKind = value as ConsolidationPeriodKind;
          setPeriodKind(nextKind);
          if (month === null) return;
          if (nextKind === "year") onMonthChange(12);
          if (nextKind === "quarter") onMonthChange(Math.ceil(month / 3) * 3);
        },
        ariaLabel: "选择周期类型",
        presentation: "segmented" as const,
      },
      {
        kind: "period" as const,
        key: "accounting-period",
        mode: "nav" as const,
        label: year === null || month === null ? "选择期间" : consolidationPeriodLabel(year, month, periodKind),
        onPrevious: () => {
          if (year === null || month === null) return;
          const next = shiftConsolidationPeriod(year, month, periodKind, -1);
          changePeriod(next.year, next.month);
        },
        onNext: () => {
          if (year === null || month === null) return;
          const next = shiftConsolidationPeriod(year, month, periodKind, 1);
          changePeriod(next.year, next.month);
        },
        ...(periodValue ? {
          picker: {
            precision: periodKind,
            value: periodValue,
            onChange: (value: string) => {
              const next = parseConsolidationPeriod(value, periodKind);
              if (next) changePeriod(next.year, next.month);
            },
            ariaLabel: "选择会计期间",
          },
        } : {}),
        disabled: loading || year === null || month === null,
      },
      ...(error ? [{
        kind: "action-group" as const,
        key: "retry",
        actions: [{ key: "retry", kind: "retry" as const, label: "重试", onClick: onRefresh }],
      }] : []),
      ...(loading ? [{ kind: "text" as const, key: "loading", content: "正在读取期间…" }] : []),
    ];
  }, [error, loading, month, onMonthChange, onRefresh, onYearChange, periodKind, year]);
}

function fallbackSections(error: string | null, loading: boolean): BodySurfaceSectionSpec[] {
  if (loading) return [createStatusSection("consolidation-loading", { kind: "loading", content: "正在读取合并报表" })];
  return [createStatusSection("consolidation-error", { kind: "error", content: error || "合并报表加载失败" })];
}

export function ConsolidationWorkpaperTab(props: ConsolidationTabProps) {
  const { data, error, loading, navigation } = props;
  const commands = useConsolidationCommands(data, props.onRefresh);
  const periodToolbarItems = usePeriodToolbar(props);
  const toolbarItems: SurfaceToolbarItems = [
    ...periodToolbarItems,
    ...(data?.batch?.status === "draft" ? [{
      kind: "action-group" as const,
      key: "generate-adjustments",
      actions: [{
        key: "generate",
        kind: "entry" as const,
        label: commands.busy ? "正在生成…" : "生成抵销分录",
        disabled: commands.busy || !props.capabilities.canUpdate,
        onClick: () => void commands.generateEntries(),
      }],
    }] : []),
  ];

  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = fallbackSections(error, loading);
  } else {
    const investmentRows = data.adjustmentComparisons.filter((row) => row.category === "investment");
    const intercompanyRows = data.adjustmentComparisons.filter((row) => row.category === "intercompany");
    sections = [
      createAnalysisSection("investment-adjustments", {
        title: "投资款",
        sections: [createPageTableSection("investment-adjustment-table", {
          rows: investmentRows,
          columns: adjustmentComparisonColumns,
          visibleColumns: adjustmentComparisonColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          rowState: (row) => row.status === "equal" ? "normal" : "danger",
          presentation: { density: "compact", cellWrap: "wrap" },
          scroll: { x: true },
          emptyText: "当前期间没有投资款抵消事项",
        })],
      }),
      createAnalysisSection("intercompany-adjustments", {
        title: "往来款",
        sections: [createPageTableSection("intercompany-adjustment-table", {
          rows: intercompanyRows,
          columns: adjustmentComparisonColumns,
          visibleColumns: adjustmentComparisonColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          rowState: (row) => row.status === "equal" ? "normal" : "danger",
          presentation: { density: "compact", cellWrap: "wrap" },
          scroll: { x: true },
          emptyText: "当前期间没有客户或供应商公司间往来",
        })],
      }),
    ];
  }
  if (data && error) sections = [createStatusSection("consolidation-refresh-error", { kind: "error", content: error }), ...sections];
  return <PageSurface kind="standard" tabbar={navigation} toolbar={{ items: toolbarItems }} body={createPageBody(sections)} />;
}
