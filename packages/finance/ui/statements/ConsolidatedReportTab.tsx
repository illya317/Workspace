"use client";

import {
  PageSurface,
  createAnalysisSection,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type DataSurfaceDisplaySpec,
} from "@workspace/core/ui";
import type {
  ConsolidatedOutputLine,
  ConsolidatedStatementOutput,
  StatementReportType,
} from "@workspace/finance/types";
import { useMemo, useState } from "react";

import { formatFinanceAmount } from "../formatters";
import { consolidationCheckColumns } from "./consolidation-columns";
import {
  type ConsolidationTabProps,
  usePeriodToolbar,
} from "./ConsolidationTabs";
import { useConsolidatedReport } from "./useConsolidatedReport";

const REPORT_TYPE_OPTIONS = [
  { value: "balanceSheet", label: "合并资产负债表" },
  { value: "incomeStatement", label: "合并利润表" },
  { value: "cashFlow", label: "合并现金流量表" },
] satisfies { value: StatementReportType; label: string }[];

function amountDisplay(value: number): DataSurfaceDisplaySpec {
  if (Math.abs(value) < 0.005) return { kind: "empty" };
  return {
    kind: "text",
    value: `${value < 0 ? "-" : ""}${formatFinanceAmount(Math.abs(value))}`,
    tone: value < 0 ? "danger" : "default",
  };
}

const consolidatedReportColumns: DataSurfaceColumnSpec<ConsolidatedOutputLine>[] = [
  {
    key: "line",
    label: "项目",
    required: true,
    width: "wide",
    cell: (row) => ({
      kind: "stack",
      gap: "xs",
      items: [
        { kind: "text", value: row.label, emphasis: row.isHeader || row.isTotal || row.isGrandTotal ? "strong" : "normal", wrap: "wrap" },
        ...(!row.isHeader && !row.isTotal && !row.isGrandTotal
          ? [{ kind: "text" as const, value: row.lineCode, tone: "muted" as const }]
          : []),
      ],
    }),
  },
  { key: "source", label: "单体汇总", required: true, align: "right", width: "md", cell: (row) => amountDisplay(row.sourceAmount) },
  { key: "adjustment", label: "抵销调整", required: true, align: "right", width: "md", cell: (row) => amountDisplay(row.adjustmentAmount) },
  { key: "consolidated", label: "合并数", required: true, align: "right", width: "md", emphasis: "medium", cell: (row) => amountDisplay(row.amount) },
  { key: "previousSource", label: "上期单体", align: "right", width: "md", cell: (row) => amountDisplay(row.previousSourceAmount ?? row.previousAmount) },
  { key: "previousAdjustment", label: "上期抵销", align: "right", width: "md", cell: (row) => amountDisplay(row.previousAdjustmentAmount ?? 0) },
  { key: "previous", label: "上期合并", required: true, align: "right", width: "md", cell: (row) => amountDisplay(row.previousAmount) },
];

function reportTable(statement: ConsolidatedStatementOutput): BodySurfaceSectionSpec {
  return createPageTableSection(`consolidated-${statement.reportType}`, {
    rows: statement.lines,
    columns: consolidatedReportColumns,
    visibleColumns: consolidatedReportColumns.map((column) => column.key),
    rowKey: (row) => row.lineCode,
    presentation: { density: "compact", cellWrap: "wrap" },
    scroll: { x: true },
    rowState: (row) => row.isGrandTotal || row.isTotal
      ? "total"
      : row.isHeader
        ? "section"
        : Math.abs(row.adjustmentAmount) >= 0.005
          ? "warning"
          : "normal",
    emptyText: "当前批次没有可输出的报表行",
  });
}

function blockersSection(props: ConsolidationTabProps): BodySurfaceSectionSpec {
  return createAnalysisSection("consolidated-blockers", {
    title: "发布前检查",
    sections: [createPageTableSection("consolidated-blocker-table", {
      rows: props.data?.checks ?? [],
      columns: consolidationCheckColumns,
      visibleColumns: consolidationCheckColumns.map((column) => column.key),
      rowKey: (row) => row.key,
      presentation: { density: "compact" },
      rowState: (row) => row.status === "blocked" ? "danger" : row.status === "attention" ? "warning" : "normal",
    })],
  });
}

export function ConsolidatedReportTab(props: ConsolidationTabProps) {
  const { data, error: overviewError, loading: overviewLoading, navigation } = props;
  const [reportType, setReportType] = useState<StatementReportType>("balanceSheet");
  const batchStatus = data?.batch?.status ?? null;
  const output = useConsolidatedReport(data?.batch?.id ?? null, batchStatus);
  const toolbarItems = usePeriodToolbar(props);
  const toolbar = useMemo(() => ({
    items: [
      ...toolbarItems,
      {
        kind: "select" as const,
        key: "reportType",
        label: "合并报表",
        options: REPORT_TYPE_OPTIONS,
        value: reportType,
        onChange: (value: string) => setReportType(value as StatementReportType),
      },
    ],
  }), [reportType, toolbarItems]);

  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = [createStatusSection("consolidated-overview-status", {
      kind: overviewLoading ? "loading" : "error",
      content: overviewLoading ? "正在读取合并批次" : overviewError || "合并批次加载失败",
    })];
  } else if (batchStatus !== "locked" && batchStatus !== "published") {
    sections = [
      createMessageSection("consolidated-output-status", {
        tone: "warning",
        content: `${data.outputMessage} 合并数只有在完成独立复核并锁定批次后生成，避免来源、汇率或抵销仍可修改时出现“准正式”报表。`,
      }),
      createMetricsSection("consolidated-output-metrics", {
        metrics: [
          { key: "status", label: "批次状态", value: data.batch?.status ?? "尚未建批" },
          { key: "period", label: "报表期间", value: data.scope.periodLabel },
          { key: "entities", label: "合并实体", value: String(data.metrics.entityCount) },
          { key: "blockers", label: "未闭环控制", value: String(data.metrics.blockerCount) },
        ],
      }),
      blockersSection(props),
    ];
  } else if (output.loading) {
    sections = [createStatusSection("consolidated-report-loading", { kind: "loading", content: "正在读取已锁定的合并输出快照" })];
  } else if (!output.report) {
    sections = [
      createMessageSection("consolidated-report-error", { tone: "danger", content: output.error || "合并报表生成失败" }),
      blockersSection(props),
    ];
  } else {
    const statement = output.report.statements.find((item) => item.reportType === reportType)
      ?? output.report.statements[0];
    sections = [
      createMessageSection("consolidated-report-lineage", {
        tone: batchStatus === "published" ? "muted" : "warning",
        content: batchStatus === "published"
          ? "以下数字来自已发布批次快照：冻结的单体三表按本位币和批次汇率折算，再叠加已批准抵销分录；任何后续变化都必须新建版本。"
          : "以下是已锁定、尚未发布的正式候选结果。单体汇总、抵销调整与合并数并列展示，发布前应逐行复核重大调整。",
      }),
      ...(overviewError ? [createMessageSection("consolidated-refresh-error", { tone: "danger", content: overviewError })] : []),
      createMetricsSection("consolidated-report-metrics", {
        metrics: [
          { key: "status", label: "批次状态", value: batchStatus === "published" ? "已发布" : "已锁定" },
          { key: "version", label: "批次版本", value: `v${output.report.batch.version}` },
          { key: "sources", label: "冻结来源", value: String(output.report.sourceCount) },
          { key: "entries", label: "已批准抵销", value: String(output.report.approvedEntryCount) },
        ],
      }),
      ...(statement ? [createAnalysisSection("consolidated-statement", {
        title: `${statement.label} · ${data.scope.periodLabel}`,
        sections: [reportTable(statement)],
      })] : [createStatusSection("consolidated-statement-empty", { kind: "empty", content: "当前批次未生成合并报表" })]),
    ];
  }

  return <PageSurface kind="standard" tabbar={navigation} toolbar={toolbar} body={createPageBody(sections)} />;
}
