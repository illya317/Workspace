"use client";

import { useMemo, useState } from "react";
import {
  createAnalysisSection,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import {
  COST_ANALYSIS_METRIC_LABELS,
  type CostAnalysisBlock,
  type CostAnalysisMetricKey,
  type CostOperationalAnalysisDefinition,
  type CostOperationalAnalysisRuntimeDTO,
  type OperationalAnalysisScopeType,
  type SalesAnalysisBlock,
  type SalesOperationalAnalysisDefinition,
} from "@workspace/finance/types";

import { useShipmentToolbarItems } from "../components/CostFilters";
import { useShipmentSurface } from "../components/ShipmentTable";
import { createDefaultShipmentWorkspaceState, type ShipmentWorkspaceState } from "../types";
import { useCostOperationalAnalysisRuntime, type CostAnalysisRuntimeFilters } from "./useCostOperationalAnalysisRuntime";
import { useOperationalAnalysisWorkspace, workspaceTemplateId } from "./useOperationalAnalysisWorkspace";
import { useWorkspaceApiOperationalAnalysis } from "./useWorkspaceApiOperationalAnalysis";
import { useWorkspaceSourcesOperationalAnalysisRuntime } from "./useWorkspaceSourcesOperationalAnalysisRuntime";
import {
  workspaceApiSections,
  workspaceApiToolbarItems,
} from "./WorkspaceApiOperationalAnalysisSections";
import {
  workspaceSourcesSections,
  workspaceSourcesToolbarItems,
} from "./WorkspaceSourcesOperationalAnalysisSections";

export function useOperationalAnalysisPage(
  scopeType: OperationalAnalysisScopeType,
  scopeId: number,
) {
  const workspace = useOperationalAnalysisWorkspace(scopeType, scopeId);
  const [shipmentView, setShipmentView] = useState<ShipmentWorkspaceState>(() => createDefaultShipmentWorkspaceState());
  const selectedDefinition = workspace.selectedTemplate?.definition ?? null;
  const salesDefinition = selectedDefinition?.dataset === "sales.shipments" ? selectedDefinition : null;
  const costDefinition = selectedDefinition?.dataset === "finance.costStructure" ? selectedDefinition : null;
  const workspaceApiDefinition = selectedDefinition?.dataset === "workspace.api" ? selectedDefinition : null;
  const workspaceSourcesDefinition = selectedDefinition?.dataset === "workspace.sources" ? selectedDefinition : null;
  const shipmentScope = useMemo(
    () => scopeType === "project" ? undefined : { scopeType, scopeId },
    [scopeId, scopeType],
  );

  const allShipmentToolbarItems = useShipmentToolbarItems({ value: shipmentView, onChange: setShipmentView });
  const shipmentSurface = useShipmentSurface(shipmentView, setShipmentView, {
    scope: shipmentScope,
    chartLayout: salesDefinition?.layout === "grid" ? "grid" : "stack",
    enabled: Boolean(salesDefinition) && scopeType !== "project",
  });
  const costRuntime = useCostOperationalAnalysisRuntime({
    scopeType,
    scopeId,
    templateId: costDefinition ? workspaceTemplateId(workspace.selectedTemplate) : null,
    definition: costDefinition,
  });
  const workspaceApiRuntime = useWorkspaceApiOperationalAnalysis({
    scopeType,
    scopeId,
    definition: workspaceApiDefinition,
  });
  const workspaceSourcesRuntime = useWorkspaceSourcesOperationalAnalysisRuntime({
    scopeType,
    scopeId,
    templateId: workspaceSourcesDefinition ? workspaceTemplateId(workspace.selectedTemplate) : null,
    revision: workspaceSourcesDefinition ? workspace.selectedTemplate?.revision ?? null : null,
    onRevisionConflict: workspace.refetch,
  });
  const revisionPreviewRuntime = useWorkspaceSourcesOperationalAnalysisRuntime({
    scopeType,
    scopeId,
    templateId: workspace.revisionPreview?.templateId ?? null,
    revision: workspace.revisionPreview?.revision ?? null,
    preview: workspace.revisionPreview
      ? { expectedRevision: workspace.revisionPreview.expectedRevision }
      : null,
    onRevisionConflict: workspace.refetch,
  });

  const customToolbarItems = useMemo<SurfaceToolbarItems>(() => {
    if (workspace.revisionPreview) {
      return workspaceSourcesToolbarItems(
        revisionPreviewRuntime.filters,
        revisionPreviewRuntime.setFilterValue,
      );
    }
    if (salesDefinition) return salesToolbarItems(allShipmentToolbarItems, salesDefinition);
    if (costDefinition) return costToolbarItems(costDefinition, costRuntime.filters, costRuntime.setFilters, costRuntime.data);
    if (workspaceApiDefinition) {
      return workspaceApiToolbarItems(
        workspaceApiDefinition,
        workspaceApiRuntime.sources,
        workspaceApiRuntime.filters,
        workspaceApiRuntime.setFilters,
      );
    }
    if (workspaceSourcesDefinition) {
      return workspaceSourcesToolbarItems(
        workspaceSourcesRuntime.filters,
        workspaceSourcesRuntime.setFilterValue,
      );
    }
    return [];
  }, [
    allShipmentToolbarItems,
    costDefinition,
    costRuntime.data,
    costRuntime.filters,
    costRuntime.setFilters,
    salesDefinition,
    revisionPreviewRuntime.filters,
    revisionPreviewRuntime.setFilterValue,
    workspace.revisionPreview,
    workspaceApiDefinition,
    workspaceApiRuntime.filters,
    workspaceApiRuntime.setFilters,
    workspaceApiRuntime.sources,
    workspaceSourcesDefinition,
    workspaceSourcesRuntime.filters,
    workspaceSourcesRuntime.setFilterValue,
  ]);

  const content = useMemo(() => {
    if (workspace.loading) {
      return [createStatusSection("operational-analysis-loading", { kind: "loading", content: "经营分析模板加载中…" })];
    }
    if (workspace.error) {
      return [createStatusSection("operational-analysis-error", { kind: "error", content: workspace.error })];
    }
    if (workspace.revisionPreview) {
      return [
        createMessageSection("operational-analysis-revision-preview", {
          tone: "warning",
          content: `正在安全预览「${workspace.revisionPreview.templateName}」v${workspace.revisionPreview.revision}。预览会按你的当前权限读取真实数据，但不会影响普通读者。`,
          link: undefined,
        }),
        ...workspaceSourcesSections(
          revisionPreviewRuntime.data,
          revisionPreviewRuntime.loading,
          revisionPreviewRuntime.error,
        ),
        {
          key: "operational-analysis-revision-preview-exit",
          chrome: "plain" as const,
          body: {
            kind: "section" as const,
            commands: [{
              key: "exit-preview",
              label: "退出预览",
              icon: "back" as const,
              onClick: workspace.clearRevisionPreview,
            }],
          },
        },
      ];
    }
    if (!workspace.selectedTemplate) {
      return [createStatusSection("operational-analysis-empty", {
        kind: "empty",
        content: workspace.selectedManagedTemplate?.status === "archived"
          ? "这个模板已归档。打开“版本与发布”可恢复为草稿，恢复后仍需重新发布。"
          : workspace.selectedManagedTemplate
            ? "这份模板目前只有草稿，普通读者看不到。打开“版本与发布”预览草稿并发布。"
            : workspace.catalog?.canConfigure
              ? "这里还没有经营分析模板。点击工具栏的 +，告诉页面助手你关心的业务问题、字段和图表。"
          : "这里还没有可查看的经营分析模板，请联系空间负责人配置。",
      })];
    }
    if (salesDefinition) return salesSections(salesDefinition, shipmentSurface.sections);
    if (costDefinition) return costSections(costDefinition, costRuntime.data, costRuntime.loading, costRuntime.error);
    if (workspaceApiDefinition) {
      return workspaceApiSections(
        workspaceApiDefinition,
        workspaceApiRuntime.sources,
        workspaceApiRuntime.filters,
        workspaceApiRuntime.loading,
        workspaceApiRuntime.error,
      );
    }
    if (workspaceSourcesDefinition) {
      return workspaceSourcesSections(
        workspaceSourcesRuntime.data,
        workspaceSourcesRuntime.loading,
        workspaceSourcesRuntime.error,
      );
    }
    return [createStatusSection("operational-analysis-definition-error", { kind: "error", content: "分析模板定义无效" })];
  }, [
    costDefinition,
    costRuntime.data,
    costRuntime.error,
    costRuntime.loading,
    salesDefinition,
    shipmentSurface.sections,
    workspace.catalog?.canConfigure,
    workspace.error,
    workspace.loading,
    workspace.revisionPreview,
    workspace.clearRevisionPreview,
    workspace.selectedManagedTemplate,
    workspace.selectedTemplate,
    workspaceApiDefinition,
    workspaceApiRuntime.error,
    workspaceApiRuntime.filters,
    workspaceApiRuntime.loading,
    workspaceApiRuntime.sources,
    workspaceSourcesDefinition,
    workspaceSourcesRuntime.data,
    workspaceSourcesRuntime.error,
    workspaceSourcesRuntime.loading,
    revisionPreviewRuntime.data,
    revisionPreviewRuntime.error,
    revisionPreviewRuntime.loading,
  ]);

  return {
    toolbarItems: [
      ...workspace.templateToolbarItems,
      ...workspace.lifecycleToolbarItems,
      ...customToolbarItems,
    ],
    body: createPageBody([
      ...content,
      workspace.lifecycleModalSection,
      workspace.assistantCreateSection,
    ], {
      layout: (revisionPreviewRuntime.data?.layout ?? workspaceSourcesRuntime.data?.layout ?? selectedDefinition?.layout) === "grid" ? "grid" : "stack",
      gridColumns: 2,
    }),
    footer: salesDefinition?.blocks.some((block) => block.kind === "salesDetails")
      ? shipmentSurface.footer
      : undefined,
  };
}

function salesToolbarItems(
  items: SurfaceToolbarItems,
  definition: SalesOperationalAnalysisDefinition,
): SurfaceToolbarItems {
  const keyByFilter: Record<SalesOperationalAnalysisDefinition["filters"][number], string> = {
    periodMode: "period-mode",
    period: "period-value",
    groupBy: "group-by",
    metric: "sort-by",
    sortOrder: "sort-order",
    pageSize: "page-size",
  };
  const allowed = new Set(definition.filters.map((filter) => keyByFilter[filter]));
  return items.filter((item) => allowed.has(item.key));
}

function salesSections(
  definition: SalesOperationalAnalysisDefinition,
  available: BodySurfaceSectionSpec[],
) {
  const byKey = new Map(available.map((section) => [section.key, section]));
  const statusSections = available.filter((section) => section.key.endsWith("-loading") || section.key.endsWith("-error"));
  if (statusSections.length) return statusSections;
  return definition.blocks.flatMap((block, index) => {
    if (block.kind === "note") return [noteSection(block, index)];
    if (block.kind === "salesMetrics") {
      return [byKey.get("shipment-metrics"), byKey.get("shipment-coverage")].filter(Boolean) as BodySurfaceSectionSpec[];
    }
    const key = {
      salesCharts: "shipment-charts",
      salesSummary: "shipment-summary",
      salesDetails: "shipment-details",
    }[block.kind];
    const section = byKey.get(key);
    return section ? [section] : [];
  });
}

function costToolbarItems(
  definition: CostOperationalAnalysisDefinition,
  filters: CostAnalysisRuntimeFilters,
  setFilters: (next: CostAnalysisRuntimeFilters) => void,
  data: CostOperationalAnalysisRuntimeDTO | null,
): SurfaceToolbarItems {
  const items: SurfaceToolbarItems = [];
  if (definition.filters.includes("year")) {
    const years = Array.from(new Set([filters.year, ...(data?.years ?? [])].filter((year): year is number => Boolean(year))));
    items.push({
      kind: "select",
      key: "cost-year",
      label: "年份",
      value: filters.year ? String(filters.year) : "",
      options: years.sort((a, b) => b - a).map((year) => ({ value: String(year), label: `${year}年` })),
      onChange: (value) => setFilters({ ...filters, year: value ? Number(value) : undefined }),
    });
  }
  if (definition.filters.includes("month")) {
    items.push({
      kind: "select",
      key: "cost-month",
      label: "月份",
      value: filters.month ? String(filters.month) : "all",
      options: [
        { value: "all", label: "全年" },
        ...Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}月` })),
      ],
      onChange: (value) => setFilters({ ...filters, month: value === "all" ? undefined : Number(value) }),
    });
  }
  if (definition.filters.includes("product")) {
    items.push({
      kind: "search",
      key: "cost-product",
      value: filters.product,
      placeholder: "筛选产品",
      ariaLabel: "筛选成本分析产品",
      onChange: (product) => setFilters({ ...filters, product }),
    });
  }
  return items;
}

function costSections(
  definition: CostOperationalAnalysisDefinition,
  data: CostOperationalAnalysisRuntimeDTO | null,
  loading: boolean,
  error: string | null,
) {
  if (loading) return [createStatusSection("cost-operational-analysis-loading", { kind: "loading", content: "成本分析加载中…" })];
  if (error || !data) return [createStatusSection("cost-operational-analysis-error", { kind: "error", content: error || "成本分析加载失败" })];
  return definition.blocks.map((block, index) => costBlockSection(block, index, data));
}

function costBlockSection(
  block: CostAnalysisBlock,
  index: number,
  data: CostOperationalAnalysisRuntimeDTO,
): BodySurfaceSectionSpec {
  if (block.kind === "note") return noteSection(block, index);
  if (block.kind === "costMetrics") {
    return createMetricsSection(`cost-metrics-${index}`, {
      metrics: block.metrics.map((metric) => ({
        key: metric,
        label: COST_ANALYSIS_METRIC_LABELS[metric],
        value: formatCostMetric(metric, data.summary[metric]),
      })),
    });
  }
  if (block.kind === "costTrend") return costTrendSection(block, index, data);
  if (block.kind === "costBreakdown") return costBreakdownSection(block, index, data);
  if (block.kind === "costRanking") return costRankingSection(block, index, data);
  return costTableSection(block, index, data);
}

function costTrendSection(
  block: Extract<CostAnalysisBlock, { kind: "costTrend" }>,
  index: number,
  data: CostOperationalAnalysisRuntimeDTO,
) {
  const comparison = block.comparison ?? "none";
  const showMonth = comparison === "monthOverMonth" || comparison === "both";
  const showYear = comparison === "yearOverYear" || comparison === "both";
  return createAnalysisSection(`cost-trend-${index}`, {
    title: block.title || `${COST_ANALYSIS_METRIC_LABELS[block.metric]}趋势`,
    sections: [{
      key: `cost-trend-chart-${index}`,
      body: { kind: "visualization", visualization: { kind: "chart", chart: { visual: {
        kind: "groupedBarChart",
        height: 360,
        groups: data.trend.map((point) => ({
          key: point.key,
          label: point.label,
          bars: [
            { key: "current", label: "本期", value: point.values[block.metric] ?? 0, valueLabel: formatCostMetric(block.metric, point.values[block.metric]), tone: "amber" as const },
            ...(showMonth ? [{ key: "previous-month", label: "上期", value: point.previousMonth?.[block.metric] ?? 0, valueLabel: formatCostMetric(block.metric, point.previousMonth?.[block.metric]), tone: "slate" as const }] : []),
            ...(showYear ? [{ key: "previous-year", label: "上年同期", value: point.previousYear?.[block.metric] ?? 0, valueLabel: formatCostMetric(block.metric, point.previousYear?.[block.metric]), tone: "emerald" as const }] : []),
          ],
        })),
        legend: [
          { key: "current", label: "本期", tone: "amber" },
          ...(showMonth ? [{ key: "previous-month", label: "上期", tone: "slate" as const }] : []),
          ...(showYear ? [{ key: "previous-year", label: "上年同期", tone: "emerald" as const }] : []),
        ],
        legendPlacement: "header-center",
        emptyText: "当前筛选范围没有趋势数据",
      } } } },
    }],
  });
}

function costBreakdownSection(
  block: Extract<CostAnalysisBlock, { kind: "costBreakdown" }>,
  index: number,
  data: CostOperationalAnalysisRuntimeDTO,
) {
  return createAnalysisSection(`cost-breakdown-${index}`, {
    title: block.title || "成本构成",
    sections: [{
      key: `cost-breakdown-chart-${index}`,
      body: { kind: "visualization", visualization: { kind: "chart", chart: { visual: {
        kind: "barChart",
        height: 340,
        bars: block.metrics.map((metric, metricIndex) => ({
          key: metric,
          label: COST_ANALYSIS_METRIC_LABELS[metric],
          value: data.summary[metric] ?? 0,
          valueLabel: formatCostMetric(metric, data.summary[metric]),
          tone: metricIndex % 2 === 0 ? "amber" as const : "emerald" as const,
        })),
        emptyText: "当前筛选范围没有成本构成数据",
      } } } },
    }],
  });
}

function costRankingSection(
  block: Extract<CostAnalysisBlock, { kind: "costRanking" }>,
  index: number,
  data: CostOperationalAnalysisRuntimeDTO,
) {
  const rows = [...data.ranking]
    .sort((left, right) => (right.values[block.metric] ?? 0) - (left.values[block.metric] ?? 0))
    .slice(0, block.limit ?? 10);
  return createAnalysisSection(`cost-ranking-${index}`, {
    title: block.title || `${COST_ANALYSIS_METRIC_LABELS[block.metric]}排行`,
    sections: [{
      key: `cost-ranking-chart-${index}`,
      body: { kind: "visualization", visualization: { kind: "chart", chart: { visual: {
        kind: "comparisonBars",
        sections: [{
          key: "ranking",
          title: `Top ${rows.length}`,
          tone: "amber",
          items: rows.map((row) => ({
            key: row.key,
            label: row.label,
            actual: row.values[block.metric] ?? 0,
            valueLabel: formatCostMetric(block.metric, row.values[block.metric]),
            tone: "amber",
          })),
        }],
        emptyText: "当前筛选范围没有产品排行数据",
      } } } },
    }],
  });
}

function costTableSection(
  block: Extract<CostAnalysisBlock, { kind: "costTable" }>,
  index: number,
  data: CostOperationalAnalysisRuntimeDTO,
) {
  const rows = data.rows.slice(0, block.limit ?? 100);
  const columns: DataSurfaceColumnSpec<(typeof rows)[number]>[] = [
    { key: "period", label: "期间", required: true, cell: (row) => row.month ? `${row.year}年${row.month}月` : `${row.year}年` },
    { key: "product", label: "产品", required: true, cell: (row) => row.product },
    ...block.metrics.map((metric) => ({
      key: metric,
      label: COST_ANALYSIS_METRIC_LABELS[metric],
      required: true,
      align: "right" as const,
      numeric: true,
      cell: (row: (typeof rows)[number]) => formatCostMetric(metric, row.values[metric]),
    })),
  ];
  return createAnalysisSection(`cost-table-${index}`, {
    title: block.title || "成本明细",
    sections: [createPageTableSection(`cost-table-data-${index}`, {
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => row.key,
      presentation: { density: "compact", header: "strong", rowHover: "neutral" },
      emptyText: "当前筛选范围没有成本明细",
    })],
  });
}

function noteSection(block: Extract<SalesAnalysisBlock | CostAnalysisBlock, { kind: "note" }>, index: number) {
  return createMessageSection(`operational-analysis-note-${index}`, {
    tone: "muted",
    content: block.title ? `${block.title}：${block.content}` : block.content,
  });
}

function formatCostMetric(metric: CostAnalysisMetricKey, value: number | null | undefined) {
  if (value == null) return "—";
  if (metric === "unitCost") return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.round(value).toLocaleString("zh-CN");
}
