"use client";

import { useEffect, useState } from "react";
import {
  createAnalysisSection,
  createMessageSection,
  createMetricsSection,
  createPageTableSection,
  createSectionsSection,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import type {
  BodySurfaceModalSpec,
  BodySurfaceSectionSpec,
  PageSurfaceFooterSpec,
} from "@workspace/core/ui";
import type {
  FinanceShipmentAnalyticsResponse,
  FinanceShipmentGroupRow,
  FinanceShipmentMetricKey,
} from "@workspace/finance/types";
import { useShipmentAnalytics, useShipmentData } from "../hooks/useFinanceCostData";
import type { ShipmentDetailSortField, ShipmentQueryScope, ShipmentWorkspaceState, SourceTraceInfo } from "../types";
import { shipmentDateRange } from "./CostFilters";
import { createCostDataSurface, createCostTraceAction, type CostRecord } from "./CostDataTable";
import { createSourceTraceModal } from "./SourceTraceModal";

const METRIC_LABELS: Record<FinanceShipmentMetricKey, string> = {
  quantity: "发货数量",
  amount: "发货金额",
  receivedAmount: "回款金额",
};

export function useShipmentSurface(
  view: ShipmentWorkspaceState,
  onViewChange: (view: ShipmentWorkspaceState) => void,
  options: {
    scope?: ShipmentQueryScope;
    chartLayout?: "grid" | "stack";
    enabled?: boolean;
  } = {},
): {
  sections: BodySurfaceSectionSpec[];
  footer?: PageSurfaceFooterSpec;
  modals: BodySurfaceModalSpec[];
} {
  const [page, setPage] = useState(1);
  const [trace, setTrace] = useState<{ open: boolean; info: SourceTraceInfo | null }>({ open: false, info: null });
  const range = shipmentDateRange(view);
  const enabled = options.enabled ?? true;
  const detail = useShipmentData(view, page, options.scope, enabled);
  const analytics = useShipmentAnalytics(view, options.scope, enabled);

  useEffect(() => {
    setPage(1);
  }, [range.dateFrom, range.dateTo, view.pageSize, view.detailSortBy, view.detailSortOrder]);

  const toggleSort = (sortBy: ShipmentWorkspaceState["sortBy"]) => {
    onViewChange({
      ...view,
      sortBy,
      sortOrder: view.sortBy === sortBy && view.sortOrder === "desc" ? "asc" : "desc",
    });
  };

  const toggleDetailSort = (detailSortBy: ShipmentDetailSortField) => {
    onViewChange({
      ...view,
      detailSortBy,
      detailSortOrder: view.detailSortBy === detailSortBy && view.detailSortOrder === "desc" ? "asc" : "desc",
    });
  };

  const detailColumns: DataSurfaceColumnSpec<CostRecord>[] = [
    detailSortableColumn("date", "日期", view, toggleDetailSort, (row) => String(row.date ?? "—")),
    { key: "customerName", label: "客户", required: true, cell: (row) => String(row.customerName ?? "—") },
    { key: "customerMasterStatus", label: "客户主数据", required: true, width: "sm", cell: (row) => row.customerMasterStatus === "linked" ? "已关联" : "待关联" },
    {
      key: "employeeName",
      label: "销售归属",
      required: true,
      cell: (row) => row.salespersonStatus === "unlinked"
        ? `${String(row.employeeName ?? row.salespersonName ?? "未注明姓名")}（待关联员工）`
        : String(row.employeeName ?? "未注明销售归属"),
    },
    { key: "productName", label: "存货名称", required: true, cell: (row) => String(row.productName ?? "—") },
    { key: "spec", label: "规格型号", required: true, cell: (row) => String(row.spec ?? "—") },
    { key: "productMasterStatus", label: "产品主数据", required: true, width: "sm", cell: (row) => row.productMasterStatus === "linked" ? "已关联" : "待关联" },
    detailSortableColumn("quantity", "发货数量", view, toggleDetailSort, (row) => formatShipmentInteger(row.quantity as number | null), true),
    detailSortableColumn("amount", "发货金额", view, toggleDetailSort, (row) => formatShipmentInteger(row.amount as number | null), true),
    detailSortableColumn("receivedAmount", "回款金额", view, toggleDetailSort, (row) => formatShipmentInteger(row.receivedAmount as number | null), true),
  ];

  const table = createCostDataSurface({
    rows: detail.data,
    columns: detailColumns,
    loading: detail.loading,
    error: detail.error,
    pagination: detail.pagination,
    page,
    onPageChange: setPage,
    presentation: { density: "compact", header: "strong", rowHover: "neutral" },
    rowActions: (row) => [createCostTraceAction({ row, onTrace: (info) => setTrace({ open: true, info }) })],
  });
  const modal = createSourceTraceModal({ open: trace.open, info: trace.info, onClose: () => setTrace({ ...trace, open: false }) });

  if (!enabled) return { sections: [], modals: [] };

  return {
    sections: [
      ...analyticsSections(analytics.data, analytics.loading, analytics.error, view, toggleSort, options.chartLayout ?? "grid"),
      createAnalysisSection("shipment-details", {
        title: `发货明细 · 共 ${detail.pagination.total.toLocaleString("zh-CN")} 条`,
        sections: table.sections,
      }),
    ],
    footer: table.footer,
    modals: modal ? [modal] : [],
  };
}

function analyticsSections(
  data: FinanceShipmentAnalyticsResponse | null,
  loading: boolean,
  error: string | null,
  view: ShipmentWorkspaceState,
  onSort: (key: ShipmentWorkspaceState["sortBy"]) => void,
  chartLayout: "grid" | "stack",
): BodySurfaceSectionSpec[] {
  if (loading) return [createMessageSection("shipment-analytics-loading", { tone: "muted", content: "发货分析加载中…" })];
  if (error || !data) return [createMessageSection("shipment-analytics-error", { tone: "danger", content: error ?? "发货分析加载失败" })];
  const metricLabel = METRIC_LABELS[view.sortBy];
  const showComparison = data.scope.comparison === "previousYear";
  const sections: BodySurfaceSectionSpec[] = [
    createMetricsSection("shipment-metrics", {
      metrics: [
        { key: "quantity", label: "发货数量", value: formatShipmentInteger(data.totals.quantity) },
        { key: "amount", label: "发货金额", value: formatShipmentInteger(data.totals.amount) },
        { key: "received", label: "回款金额", value: formatShipmentInteger(data.totals.receivedAmount) },
        { key: "unreceived", label: "未回款金额", value: formatShipmentInteger(data.totals.unreceivedAmount) },
        { key: "collection-rate", label: "回款率", value: formatPercent(data.totals.collectionRate) },
        leaderMetric("top-product", "产品", data.leaders.product),
        leaderMetric("top-salesperson", "业务员", data.leaders.salesperson),
        leaderMetric("top-customer", "客户", data.leaders.customer),
      ],
    }),
  ];

  if (data.coverage.monthlyRowCount > 0) {
    sections.push(createMessageSection("shipment-coverage", {
      tone: "warning",
      content: `当前范围包含 ${data.coverage.monthlyRowCount.toLocaleString("zh-CN")} 条仅有月份、没有具体日期的记录；完整月份已计入年/月/季汇总，自定义的不完整月份不会按天摊分。`,
    }));
  }

  sections.push(
    createSectionsSection("shipment-charts", {
      layout: chartLayout,
      gridColumns: 2,
      sections: [
        createAnalysisSection("shipment-trend", {
          title: "发货与回款趋势",
          sections: [{
            key: "shipment-trend-chart",
            body: { kind: "visualization", visualization: { kind: "chart", chart: { visual: {
              kind: "groupedBarChart",
              height: 360,
              groups: data.trend.map((point) => ({
                key: point.key,
                label: point.label,
                bars: [
                  { key: "amount", label: "发货金额", value: point.amount ?? 0, tone: "amber", title: `${point.label} 发货金额 ${formatShipmentInteger(point.amount)}` },
                  { key: "received", label: "回款金额", value: point.receivedAmount ?? 0, tone: "emerald", title: `${point.label} 回款金额 ${formatShipmentInteger(point.receivedAmount)}` },
                ],
              })),
              legend: [
                { key: "amount", label: "发货金额", tone: "amber" },
                { key: "received", label: "回款金额", tone: "emerald" },
              ],
              legendPlacement: "header-center",
              emptyText: "当前期间没有趋势数据",
            } } } },
          }],
        }),
        createAnalysisSection("shipment-ranking", {
          title: `${metricLabel}排行${showComparison ? "及同比" : ""}`,
          sections: [{
            key: "shipment-ranking-chart",
            body: { kind: "visualization", visualization: { kind: "chart", chart: { visual: {
              kind: "comparisonBars",
              sections: [{
                key: "ranking",
                title: `Top ${Math.min(10, data.groups.length)}`,
                subtitle: data.groupCount > 10 ? `共 ${data.groupCount} 组` : undefined,
                tone: "amber",
                items: data.groups.slice(0, 10).map((row) => {
                  const previous = row.previousYear?.[view.sortBy] ?? null;
                  return {
                    key: row.key,
                    label: row.label,
                    actual: row[view.sortBy] ?? 0,
                    valueLabel: formatShipmentInteger(row[view.sortBy]),
                    tone: "amber" as const,
                    ...(showComparison ? {
                      reference: previous ?? undefined,
                      diffLabel: yearOnYear(row[view.sortBy], previous),
                      diffTone: yoyTone(row[view.sortBy], previous),
                    } : {}),
                  };
                }),
              }],
              legend: showComparison ? [
                { key: "current", label: "本期", tone: "amber" },
                { key: "previous", label: "上年同期", tone: "slate", marker: "reference" },
              ] : undefined,
              emptyText: "当前期间没有排行数据",
            } } } },
          }],
        }),
      ],
    }),
    createAnalysisSection("shipment-summary", {
      title: `汇总分析 · ${groupLabel(view.groupBy)} · ${metricLabel}${view.sortOrder === "desc" ? "降序" : "升序"}${data.groupCount > data.groups.length ? ` · 前${data.groups.length}/共${data.groupCount}组` : ""}`,
      sections: [createPageTableSection("shipment-summary-table", {
        rows: data.groups,
        columns: summaryColumns(view, onSort, showComparison),
        visibleColumns: [
          "label",
          "quantity",
          "amount",
          "receivedAmount",
          "unreceivedAmount",
          "collectionRate",
          ...(showComparison ? ["yearOnYear"] : []),
        ],
        rowKey: (row) => row.key,
        presentation: { density: "compact", header: "strong", rowHover: "neutral" },
        emptyText: "当前期间没有可汇总的发货数据",
      })],
    }),
  );
  return sections;
}

function summaryColumns(
  view: ShipmentWorkspaceState,
  onSort: (key: ShipmentWorkspaceState["sortBy"]) => void,
  showComparison: boolean,
): DataSurfaceColumnSpec<FinanceShipmentGroupRow>[] {
  return [
    { key: "label", label: groupLabel(view.groupBy), required: true, cell: (row) => row.label },
    sortableColumn("quantity", view, onSort, (row) => formatShipmentInteger(row.quantity)),
    sortableColumn("amount", view, onSort, (row) => formatShipmentInteger(row.amount)),
    sortableColumn("receivedAmount", view, onSort, (row) => formatShipmentInteger(row.receivedAmount)),
    { key: "unreceivedAmount", label: "未回款金额", align: "right", required: true, cell: (row) => formatShipmentInteger(row.unreceivedAmount) },
    { key: "collectionRate", label: "回款率", align: "right", required: true, cell: (row) => formatPercent(row.collectionRate) },
    ...(showComparison ? [{
      key: "yearOnYear",
      label: `${METRIC_LABELS[view.sortBy]}同比`,
      align: "right",
      required: true,
      cell: (row) => yearOnYear(row[view.sortBy], row.previousYear?.[view.sortBy] ?? null),
    } satisfies DataSurfaceColumnSpec<FinanceShipmentGroupRow>] : []),
  ];
}

function sortableColumn<Row>(
  key: ShipmentWorkspaceState["sortBy"],
  view: ShipmentWorkspaceState,
  onSort: (key: ShipmentWorkspaceState["sortBy"]) => void,
  cell: (row: Row) => string,
): DataSurfaceColumnSpec<Row> {
  const active = view.sortBy === key;
  return {
    key,
    label: `${METRIC_LABELS[key]}${active ? (view.sortOrder === "desc" ? " ↓" : " ↑") : ""}`,
    required: true,
    align: "right",
    numeric: true,
    onHeaderClick: () => onSort(key),
    cell,
  };
}

function detailSortableColumn<Row>(
  key: ShipmentDetailSortField,
  label: string,
  view: ShipmentWorkspaceState,
  onSort: (key: ShipmentDetailSortField) => void,
  cell: (row: Row) => string,
  numeric = false,
): DataSurfaceColumnSpec<Row> {
  const active = view.detailSortBy === key;
  return {
    key,
    label: `${label}${active ? (view.detailSortOrder === "desc" ? " ↓" : " ↑") : ""}`,
    required: true,
    align: numeric ? "right" : undefined,
    numeric,
    onHeaderClick: () => onSort(key),
    cell,
  };
}

function yearOnYear(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return "—";
  const change = (current - previous) / Math.abs(previous);
  return `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`;
}

function yoyTone(current: number | null, previous: number | null) {
  if (current === null || previous === null) return "slate" as const;
  return current >= previous ? "emerald" as const : "rose" as const;
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatShipmentInteger(value: number | null | undefined) {
  return value == null ? "—" : Math.round(value).toLocaleString("zh-CN");
}

function leaderMetric(
  key: string,
  subject: string,
  leader: FinanceShipmentAnalyticsResponse["leaders"][keyof FinanceShipmentAnalyticsResponse["leaders"]],
) {
  return {
    key,
    label: leader ? `发货额第一${subject} · ${formatShipmentInteger(leader.amount)}` : `发货额第一${subject}`,
    value: leader
      ? { kind: "text" as const, value: leader.label, title: leader.label, wrap: "truncate" as const }
      : "—",
  };
}

function groupLabel(groupBy: ShipmentWorkspaceState["groupBy"]) {
  if (groupBy === "customer") return "客户";
  if (groupBy === "salesperson") return "销售归属";
  if (groupBy === "product") return "存货名称";
  return "存货名称+规格型号";
}
