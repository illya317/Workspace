"use client";

import {
  PageSurface,
  createAnalysisSection,
  createListSection,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { ConsolidationOverview } from "@workspace/finance/types";
import { useMemo } from "react";
import { consolidationCheckColumns, consolidationEntityColumns } from "./consolidation-columns";

interface ConsolidationTabProps {
  data: ConsolidationOverview | null;
  error: string | null;
  loading: boolean;
  year: number | null;
  month: number | null;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  navigation: PageSurfaceTabBarSpec;
}

function usePeriodToolbar(props: ConsolidationTabProps): SurfaceToolbarItems {
  const { data, loading, month, onMonthChange, onYearChange, year } = props;
  return useMemo(() => {
    const periods = data?.scope.availablePeriods ?? [];
    const years = [...new Set(periods.map((period) => period.year))];
    const months = periods.filter((period) => period.year === year).map((period) => period.month);
    return [
      {
        kind: "select" as const,
        key: "year",
        label: "年度",
        options: years.map((value) => ({ value: String(value), label: String(value) })),
        value: year === null ? "" : String(year),
        onChange: (value: string) => onYearChange(Number(value)),
        placeholder: "选择年度",
      },
      {
        kind: "select" as const,
        key: "month",
        label: "月份",
        options: months.map((value) => ({ value: String(value), label: `${value}月` })),
        value: month === null ? "" : String(month),
        onChange: (value: string) => onMonthChange(Number(value)),
        placeholder: "选择月份",
      },
      {
        kind: "text" as const,
        key: "period",
        content: data?.scope.periodLabel ?? "等待读取可用期间",
      },
      ...(loading ? [{ kind: "text" as const, key: "loading", content: "正在核对合并来源与控制点…" }] : []),
    ];
  }, [data, loading, month, onMonthChange, onYearChange, year]);
}

function fallbackSections(error: string | null, loading: boolean): BodySurfaceSectionSpec[] {
  if (loading) return [createStatusSection("consolidation-loading", { kind: "loading", content: "正在读取合并范围和报表来源" })];
  return [createStatusSection("consolidation-error", { kind: "error", content: error || "合并底稿概览加载失败" })];
}

export function ConsolidationWorkpaperTab(props: ConsolidationTabProps) {
  const toolbarItems = usePeriodToolbar(props);
  const { data, error, loading, navigation } = props;
  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = fallbackSections(error, loading);
  } else {
    const parentName = data.scope.parent?.fullName || data.scope.parent?.name || "未识别母公司";
    sections = [
      createMessageSection("consolidation-definition", {
        content: `合并主体：${parentName} · ${data.scope.periodLabel}。此页是合并编制与人工复核工作台，只展示可追溯来源和前置控制；个别报表、汇率、抵销及复核未闭环前不生成法定合并数。`,
      }),
      ...(error ? [createMessageSection("consolidation-refresh-error", { tone: "danger", content: error })] : []),
      createMetricsSection("consolidation-readiness-metrics", {
        metrics: [
          { key: "entities", label: "合并实体", value: String(data.metrics.entityCount) },
          { key: "coverage", label: "三表来源覆盖", value: `${data.metrics.coveredSources} / ${data.metrics.totalSources}` },
          { key: "submitted", label: "已提交底稿", value: String(data.metrics.submittedWorkpapers) },
          { key: "blockers", label: "阻断项", value: String(data.metrics.blockerCount) },
        ],
      }),
      createAnalysisSection("consolidation-entity-sources", {
        title: "逐公司三表来源与数字血缘",
        sections: [
          createMessageSection("source-lineage-help", {
            tone: "muted",
            content: "优先使用已提交的报表底稿，并统计每张底稿的来源、导入、手工和公式行；只有系统账时标为回退，既无底稿也无系统事实时直接阻断。",
          }),
          createPageTableSection("consolidation-entity-source-table", {
            rows: data.entities,
            columns: consolidationEntityColumns,
            visibleColumns: consolidationEntityColumns.map((column) => column.key),
            rowKey: (row) => row.code,
            presentation: { density: "compact", cellWrap: "wrap" },
            scroll: { x: true },
            emptyText: "尚未维护合并范围",
          }),
        ],
      }),
      createAnalysisSection("consolidation-fx-policy", {
        title: "外币折算与汇率复核",
        sections: [
          createMessageSection("fx-source-status", {
            tone: "warning",
            content: `${data.fxPolicy.pair} 尚未配置可追溯汇率。拟用来源：${data.fxPolicy.sourceName}的“${data.fxPolicy.sourceField}”（${data.fxPolicy.unit}）；当前不自动抓取，也不把网页展示值直接写入合并报表。`,
          }),
          createListSection("fx-policy-list", {
            density: "compact",
            items: [
              { key: "assets-liabilities", title: "资产和负债", description: "按资产负债表日即期汇率折算。", tone: "info" },
              { key: "historical-equity", title: "实收资本及历史成本权益事项", description: "按出资或交易发生日的历史汇率折算；投资款应保留每笔出资日。", tone: "info" },
              { key: "income-expense", title: "收入和费用", description: "按交易发生日汇率，或采用有依据且能够合理近似的期间平均汇率。", tone: "info" },
              { key: "retained-earnings", title: "未分配利润", description: "按期初余额和本期利润分配滚动，不直接套用期末汇率。", tone: "info" },
              { key: "translation-difference", title: "外币报表折算差额", description: "由上述口径派生并在所有者权益中单独列示，复核后锁定。", tone: "warning" },
              { key: "fx-evidence", title: "汇率证据", description: "保留来源页面、牌价发布时间、抓取时间、字段、数值、单位和复核人，形成可重放快照。", tone: "warning" },
            ],
          }),
        ],
      }),
      createAnalysisSection("consolidation-eliminations", {
        title: "抵销工作包",
        sections: [createListSection("consolidation-elimination-list", {
          presentation: "cards",
          items: data.eliminations.map((item) => ({
            key: item.key,
            title: item.label,
            description: item.description,
            tone: "warning",
            badges: [{ key: "status", label: "待编制", tone: "warning" }],
          })),
        })],
      }),
      createAnalysisSection("consolidation-controls", {
        title: "编制、复核与发布控制",
        sections: [createPageTableSection("consolidation-control-table", {
          rows: data.checks,
          columns: consolidationCheckColumns,
          visibleColumns: consolidationCheckColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          presentation: { density: "compact" },
        })],
      }),
    ];
  }
  return <PageSurface kind="standard" tabbar={navigation} toolbar={{ items: toolbarItems }} body={createPageBody(sections)} />;
}

export function ConsolidatedReportTab(props: ConsolidationTabProps) {
  const toolbarItems = usePeriodToolbar(props);
  const { data, error, loading, navigation } = props;
  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = fallbackSections(error, loading);
  } else {
    sections = [
      createMessageSection("consolidated-output-status", {
        tone: "warning",
        content: data.outputMessage,
      }),
      ...(error ? [createMessageSection("consolidated-refresh-error", { tone: "danger", content: error })] : []),
      createMetricsSection("consolidated-output-metrics", {
        metrics: [
          { key: "status", label: "发布状态", value: "未发布" },
          { key: "period", label: "报表期间", value: data.scope.periodLabel },
          { key: "entities", label: "合并实体", value: String(data.metrics.entityCount) },
          { key: "blockers", label: "阻断项", value: String(data.metrics.blockerCount) },
        ],
      }),
      createAnalysisSection("consolidated-report-list", {
        title: "母公司合并报表",
        sections: [createListSection("consolidated-reports", {
          presentation: "cards",
          items: data.outputs.map((output) => ({
            key: output.key,
            title: output.label,
            description: output.description,
            tone: "warning",
            badges: [{ key: "status", label: "待生成", tone: "warning" }],
          })),
        })],
      }),
      createAnalysisSection("consolidated-blockers", {
        title: "发布前检查",
        sections: [createPageTableSection("consolidated-blocker-table", {
          rows: data.checks,
          columns: consolidationCheckColumns,
          visibleColumns: consolidationCheckColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          presentation: { density: "compact" },
          rowState: (row) => row.status === "blocked" ? "danger" : row.status === "attention" ? "warning" : "normal",
        })],
      }),
    ];
  }
  return <PageSurface kind="standard" tabbar={navigation} toolbar={{ items: toolbarItems }} body={createPageBody(sections)} />;
}
