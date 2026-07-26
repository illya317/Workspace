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
  WorkspaceAnalysisRuntimeBlock,
  WorkspaceAnalysisRuntimeDTO,
  WorkspaceAnalysisRuntimeFilter,
} from "@workspace/finance/types";

import { formatWorkspaceApiValue } from "./workspace-api-analysis-runtime";

const CHART_TONES = ["amber", "emerald", "blue", "rose", "slate"] as const;

export function workspaceSourcesToolbarItems(
  filters: readonly WorkspaceAnalysisRuntimeFilter[],
  onChange: (key: string, value: string) => void,
): SurfaceToolbarItems {
  return filters.map((filter) => {
    if (filter.kind === "search") {
      return {
        kind: "field-filter" as const,
        key: `workspace-sources-filter-${filter.key}`,
        fields: [{ value: filter.key, label: filter.label, valueKind: "text" as const, placeholder: filter.label }],
        valueOptions: {},
        fieldKey: filter.key,
        onFieldKeyChange: () => undefined,
        value: filter.value,
        onValueChange: (value: string) => onChange(filter.key, value),
        placeholder: filter.label,
      };
    }
    return {
      kind: "select" as const,
      key: `workspace-sources-filter-${filter.key}`,
      label: filter.label,
      value: filter.value || "__all",
      options: [
        { value: "__all", label: `全部${filter.label}` },
        ...(filter.options ?? []),
      ],
      onChange: (value: string) => onChange(filter.key, value === "__all" ? "" : value),
    };
  });
}

export function workspaceSourcesSections(
  runtime: WorkspaceAnalysisRuntimeDTO | null,
  loading: boolean,
  error: string | null,
): BodySurfaceSectionSpec[] {
  if (loading) {
    return [createStatusSection("workspace-sources-loading", {
      kind: "loading",
      content: "经营分析正在按当前模板计算…",
    })];
  }
  if (error) {
    return [createStatusSection("workspace-sources-error", { kind: "error", content: error })];
  }
  if (!runtime) {
    return [createStatusSection("workspace-sources-unavailable", {
      kind: "empty",
      content: "当前模板暂时没有可展示的分析结果。",
    })];
  }
  return runtime.blocks.map(workspaceSourcesBlockSection);
}

function workspaceSourcesBlockSection(
  block: WorkspaceAnalysisRuntimeBlock,
  index: number,
): BodySurfaceSectionSpec {
  if (block.kind === "note") {
    return createMessageSection(`workspace-sources-note-${block.key}-${index}`, {
      tone: "muted",
      content: block.title ? `${block.title}：${block.content}` : block.content,
    });
  }
  if (block.kind === "metrics") {
    return createMetricsSection(`workspace-sources-metrics-${block.key}-${index}`, {
      metrics: block.metrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        value: formatWorkspaceApiValue(metric.value, metric.format),
      })),
    });
  }
  if (block.kind === "chart") return workspaceSourcesChartSection(block, index);
  return workspaceSourcesTableSection(block, index);
}

function workspaceSourcesChartSection(
  block: Extract<WorkspaceAnalysisRuntimeBlock, { kind: "chart" }>,
  index: number,
) {
  const singleMetric = block.comparison === "none" && block.metrics.length === 1
    ? block.metrics[0]
    : null;
  const visual = singleMetric
    ? {
        kind: "barChart" as const,
        height: 360,
        bars: block.groups.map((group) => {
          const value = group.values.find((candidate) => candidate.metricKey === singleMetric.key)?.current ?? 0;
          return {
            key: group.key,
            label: group.label,
            value,
            valueLabel: formatWorkspaceApiValue(value, singleMetric.format),
            tone: "amber" as const,
          };
        }),
        emptyText: `当前筛选范围没有${block.dimensionLabel}数据`,
      }
    : {
        kind: "groupedBarChart" as const,
        height: 360,
        groups: block.groups.map((group) => ({
          key: group.key,
          label: group.label,
          bars: block.metrics.flatMap((metric, metricIndex) => {
            const value = group.values.find((candidate) => candidate.metricKey === metric.key);
            if (block.comparison === "none") {
              return [{
                key: metric.key,
                label: metric.label,
                value: value?.current ?? 0,
                valueLabel: formatWorkspaceApiValue(value?.current ?? 0, metric.format),
                tone: CHART_TONES[metricIndex % CHART_TONES.length],
              }];
            }
            return [
              {
                key: `${metric.key}-current`,
                label: "本期",
                value: value?.current ?? 0,
                valueLabel: formatWorkspaceApiValue(value?.current ?? 0, metric.format),
                tone: "amber" as const,
              },
              ...((block.comparison === "periodOverPeriod" || block.comparison === "both")
                ? [{
                    key: `${metric.key}-previous-period`,
                    label: "上期",
                    value: value?.previousPeriod ?? 0,
                    valueLabel: formatWorkspaceApiValue(value?.previousPeriod ?? 0, metric.format),
                    tone: "slate" as const,
                  }]
                : []),
              ...((block.comparison === "yearOverYear" || block.comparison === "both")
                ? [{
                    key: `${metric.key}-previous-year`,
                    label: "上年同期",
                    value: value?.previousYear ?? 0,
                    valueLabel: formatWorkspaceApiValue(value?.previousYear ?? 0, metric.format),
                    tone: "emerald" as const,
                  }]
                : []),
            ];
          }),
        })),
        legend: chartLegend(block),
        legendPlacement: "header-center" as const,
        emptyText: `当前筛选范围没有${block.dimensionLabel}数据`,
      };

  return createAnalysisSection(`workspace-sources-chart-${block.key}-${index}`, {
    title: block.title,
    sections: [{
      key: `workspace-sources-chart-visual-${block.key}-${index}`,
      body: { kind: "visualization", visualization: { kind: "chart", chart: { visual } } },
    }],
  });
}

function chartLegend(block: Extract<WorkspaceAnalysisRuntimeBlock, { kind: "chart" }>) {
  if (block.comparison === "none") {
    return block.metrics.map((metric, index) => ({
      key: metric.key,
      label: metric.label,
      tone: CHART_TONES[index % CHART_TONES.length],
    }));
  }
  return [
    { key: "current", label: "本期", tone: "amber" as const },
    ...((block.comparison === "periodOverPeriod" || block.comparison === "both")
      ? [{ key: "previous-period", label: "上期", tone: "slate" as const }]
      : []),
    ...((block.comparison === "yearOverYear" || block.comparison === "both")
      ? [{ key: "previous-year", label: "上年同期", tone: "emerald" as const }]
      : []),
  ];
}

function workspaceSourcesTableSection(
  block: Extract<WorkspaceAnalysisRuntimeBlock, { kind: "table" }>,
  index: number,
) {
  type RuntimeRow = (typeof block.rows)[number];
  const columns: DataSurfaceColumnSpec<RuntimeRow>[] = block.columns.map((column) => ({
    key: column.key,
    label: column.label,
    required: true,
    numeric: ["number", "integer", "currency", "percent"].includes(column.format),
    align: ["number", "integer", "currency", "percent"].includes(column.format) ? "right" : undefined,
    cell: (row) => formatWorkspaceApiValue(row.cells[column.key], column.format),
  }));
  return createAnalysisSection(`workspace-sources-table-${block.key}-${index}`, {
    title: block.title,
    sections: [createPageTableSection(`workspace-sources-table-data-${block.key}-${index}`, {
      rows: [...block.rows],
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => row.key,
      presentation: { density: "compact", header: "strong", rowHover: "neutral" },
      emptyText: "当前筛选范围没有明细数据",
    })],
  });
}
