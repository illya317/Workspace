"use client";

import {
  createAnalysisSection,
  createMessageSection,
  createMetricsSection,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type {
  WorkspaceApiBlock,
  WorkspaceApiMetric,
  WorkspaceApiOperationalAnalysisDefinition,
} from "@workspace/finance/types";

import {
  aggregateWorkspaceApiMetric,
  applyWorkspaceApiFilters,
  formatWorkspaceApiValue,
  groupWorkspaceApiRows,
  previousWorkspaceApiDimensionKey,
  readWorkspaceApiValue,
  type WorkspaceApiFilterValues,
  type WorkspaceApiRow,
} from "./workspace-api-analysis-runtime";

type SourceRows = Record<string, WorkspaceApiRow[]>;

export function workspaceApiToolbarItems(
  definition: WorkspaceApiOperationalAnalysisDefinition,
  sources: SourceRows,
  values: WorkspaceApiFilterValues,
  setValues: (values: WorkspaceApiFilterValues) => void,
): SurfaceToolbarItems {
  return definition.filters.map((filter) => {
    if (filter.kind === "search") {
      return {
        kind: "search" as const,
        key: `workspace-api-filter-${filter.key}`,
        value: values[filter.key] ?? "",
        placeholder: filter.label,
        ariaLabel: filter.label,
        onChange: (value: string) => setValues({ ...values, [filter.key]: value }),
      };
    }
    const options = filter.kind === "select"
      ? filter.options ?? []
      : filter.kind === "month"
        ? Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}月` }))
        : deriveYearOptions(sources[filter.source] ?? [], filter.field);
    return {
      kind: "select" as const,
      key: `workspace-api-filter-${filter.key}`,
      label: filter.label,
      value: values[filter.key] || "__all",
      options: [{ value: "__all", label: `全部${filter.label}` }, ...options],
      onChange: (value: string) => setValues({ ...values, [filter.key]: value === "__all" ? "" : value }),
    };
  });
}

export function workspaceApiSections(
  definition: WorkspaceApiOperationalAnalysisDefinition,
  sources: SourceRows,
  filters: WorkspaceApiFilterValues,
  loading: boolean,
  error: string | null,
): BodySurfaceSectionSpec[] {
  if (loading) return [createStatusSection("workspace-api-loading", { kind: "loading", content: "经营分析数据加载中…" })];
  if (error) return [createStatusSection("workspace-api-error", { kind: "error", content: error })];
  return definition.blocks.map((block, index) => workspaceApiBlockSection(definition, sources, filters, block, index));
}

function workspaceApiBlockSection(
  definition: WorkspaceApiOperationalAnalysisDefinition,
  sources: SourceRows,
  filterValues: WorkspaceApiFilterValues,
  block: WorkspaceApiBlock,
  index: number,
): BodySurfaceSectionSpec {
  if (block.kind === "note") {
    return createMessageSection(`workspace-api-note-${index}`, {
      tone: "muted",
      content: block.title ? `${block.title}：${block.content}` : block.content,
    });
  }
  const sourceRows = sources[block.source] ?? [];
  const rows = applyWorkspaceApiFilters(sourceRows, definition.filters, filterValues, block.source);
  if (block.kind === "apiMetrics") return workspaceApiMetricsSection(block, rows, index);
  if (block.kind === "apiChart") {
    const comparisonRows = applyWorkspaceApiFilters(
      sourceRows,
      definition.filters,
      filterValues,
      block.source,
      { omitDateField: block.dimension.field },
    );
    return workspaceApiChartSection(block, rows, comparisonRows, index);
  }
  return workspaceApiTableSection(block, rows, index);
}

function workspaceApiMetricsSection(
  block: Extract<WorkspaceApiBlock, { kind: "apiMetrics" }>,
  rows: WorkspaceApiRow[],
  index: number,
) {
  return createMetricsSection(`workspace-api-metrics-${index}`, {
    metrics: block.metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      value: formatMetric(metric, aggregateWorkspaceApiMetric(rows, metric)),
    })),
  });
}

function workspaceApiChartSection(
  block: Extract<WorkspaceApiBlock, { kind: "apiChart" }>,
  rows: WorkspaceApiRow[],
  comparisonRows: WorkspaceApiRow[],
  index: number,
) {
  const currentGroups = groupWorkspaceApiRows(rows, block.dimension.field, block.dimension.bucket);
  const comparisonGroups = groupWorkspaceApiRows(comparisonRows, block.dimension.field, block.dimension.bucket);
  const groups = sortChartGroups([...currentGroups.values()], block)
    .slice(0, block.limit ?? 36);
  const comparison = block.comparison ?? "none";
  const visual = comparison === "none" && block.metrics.length === 1
    ? singleMetricVisual(groups, block.metrics[0]!)
    : groupedMetricVisual(groups, comparisonGroups, block);
  return createAnalysisSection(`workspace-api-chart-${index}`, {
    title: block.title,
    sections: [{
      key: `workspace-api-chart-visual-${index}`,
      body: { kind: "visualization", visualization: { kind: "chart", chart: { visual } } },
    }],
  });
}

function singleMetricVisual(
  groups: Array<{ key: string; label: string; rows: WorkspaceApiRow[] }>,
  metric: WorkspaceApiMetric,
) {
  return {
    kind: "barChart" as const,
    height: 360,
    bars: groups.map((group) => {
      const value = aggregateWorkspaceApiMetric(group.rows, metric);
      return { key: group.key, label: group.label, value, valueLabel: formatMetric(metric, value), tone: "amber" as const };
    }),
    emptyText: "当前筛选范围没有可展示的数据",
  };
}

function groupedMetricVisual(
  groups: Array<{ key: string; label: string; rows: WorkspaceApiRow[] }>,
  allGroups: Map<string, { key: string; label: string; rows: WorkspaceApiRow[] }>,
  block: Extract<WorkspaceApiBlock, { kind: "apiChart" }>,
) {
  const comparison = block.comparison ?? "none";
  const periodEnabled = comparison === "periodOverPeriod" || comparison === "both";
  const yearEnabled = comparison === "yearOverYear" || comparison === "both";
  const tones = ["amber", "emerald", "blue", "rose", "slate"] as const;
  return {
    kind: "groupedBarChart" as const,
    height: 360,
    groups: groups.map((group) => ({
      key: group.key,
      label: group.label,
      bars: block.metrics.flatMap((metric, metricIndex) => {
        const current = aggregateWorkspaceApiMetric(group.rows, metric);
        if (!block.dimension.bucket || comparison === "none") {
          return [{ key: metric.key, label: metric.label, value: current, valueLabel: formatMetric(metric, current), tone: tones[metricIndex % tones.length] }];
        }
        const periodKey = previousWorkspaceApiDimensionKey(group.key, block.dimension.bucket, "period");
        const yearKey = previousWorkspaceApiDimensionKey(group.key, block.dimension.bucket, "year");
        const period = periodKey ? aggregateWorkspaceApiMetric(allGroups.get(periodKey)?.rows ?? [], metric) : 0;
        const year = yearKey ? aggregateWorkspaceApiMetric(allGroups.get(yearKey)?.rows ?? [], metric) : 0;
        return [
          { key: `${metric.key}-current`, label: "本期", value: current, valueLabel: formatMetric(metric, current), tone: "amber" as const },
          ...(periodEnabled ? [{ key: `${metric.key}-period`, label: periodLabel(block.dimension.bucket), value: period, valueLabel: formatMetric(metric, period), tone: "slate" as const }] : []),
          ...(yearEnabled ? [{ key: `${metric.key}-year`, label: "上年同期", value: year, valueLabel: formatMetric(metric, year), tone: "emerald" as const }] : []),
        ];
      }),
    })),
    legend: comparison === "none"
      ? block.metrics.map((metric, index) => ({ key: metric.key, label: metric.label, tone: tones[index % tones.length] }))
      : [
          { key: "current", label: "本期", tone: "amber" as const },
          ...(periodEnabled ? [{ key: "period", label: periodLabel(block.dimension.bucket), tone: "slate" as const }] : []),
          ...(yearEnabled ? [{ key: "year", label: "上年同期", tone: "emerald" as const }] : []),
        ],
    legendPlacement: "header-center" as const,
    emptyText: "当前筛选范围没有可展示的数据",
  };
}

function workspaceApiTableSection(
  block: Extract<WorkspaceApiBlock, { kind: "apiTable" }>,
  rows: WorkspaceApiRow[],
  index: number,
) {
  const displayedRows = rows.slice(0, block.limit ?? 100);
  const columns: DataSurfaceColumnSpec<WorkspaceApiRow>[] = block.columns.map((column) => ({
    key: column.key,
    label: column.label,
    required: true,
    numeric: column.format === "number" || column.format === "integer" || column.format === "currency" || column.format === "percent",
    align: column.format && column.format !== "text" && column.format !== "date" ? "right" : undefined,
    cell: (row) => formatWorkspaceApiValue(readWorkspaceApiValue(row, column.field), column.format),
  }));
  return createAnalysisSection(`workspace-api-table-${index}`, {
    title: block.title,
    sections: [createPageTableSection(`workspace-api-table-data-${index}`, {
      rows: displayedRows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row, rowIndex) => String(readWorkspaceApiValue(row, "id") ?? rowIndex),
      presentation: { density: "compact", header: "strong", rowHover: "neutral" },
      emptyText: "当前筛选范围没有明细数据",
    })],
  });
}

function sortChartGroups(
  groups: Array<{ key: string; label: string; rows: WorkspaceApiRow[] }>,
  block: Extract<WorkspaceApiBlock, { kind: "apiChart" }>,
) {
  const sort = block.sort ?? "dimensionAsc";
  return groups.sort((left, right) => {
    if (sort === "valueAsc" || sort === "valueDesc") {
      const difference = aggregateWorkspaceApiMetric(left.rows, block.metrics[0]!)
        - aggregateWorkspaceApiMetric(right.rows, block.metrics[0]!);
      return sort === "valueAsc" ? difference : -difference;
    }
    const difference = left.key.localeCompare(right.key, "zh-CN", { numeric: true });
    return sort === "dimensionAsc" ? difference : -difference;
  });
}

function formatMetric(metric: WorkspaceApiMetric, value: number) {
  const format = metric.format ?? (metric.operation === "count" || metric.operation === "distinctCount" ? "integer" : "number");
  return formatWorkspaceApiValue(value, format);
}

function periodLabel(bucket: "year" | "quarter" | "month" | undefined) {
  if (bucket === "month") return "上月";
  if (bucket === "quarter") return "上季度";
  return "上年";
}

function deriveYearOptions(rows: WorkspaceApiRow[], field: string) {
  const years = new Set<number>();
  for (const row of rows) {
    const value = readWorkspaceApiValue(row, field);
    if (typeof value !== "string" && typeof value !== "number") continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) years.add(date.getFullYear());
  }
  return [...years].sort((left, right) => right - left).map((year) => ({ value: String(year), label: `${year}年` }));
}
