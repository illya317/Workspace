import "server-only";

import { matchText } from "../../search";
import type {
  WorkspaceAnalysisRuntimeBlock,
  WorkspaceAnalysisRuntimeFilter,
  WorkspaceAnalysisRuntimeValue,
  WorkspaceSourcesMetric,
} from "../../workspace-analysis-source-contract";
import type {
  WorkspaceAnalysisExecutionPlan,
  WorkspaceAnalysisExecutionSourcePlan,
} from "../workspace-analysis-execution-plan";
import { WorkspaceAnalysisRuntimeError } from "./error";

export type WorkspaceAnalysisCanonicalRow = Readonly<Record<string, WorkspaceAnalysisRuntimeValue>>;

export function renderWorkspaceAnalysisRuntime(
  plan: WorkspaceAnalysisExecutionPlan,
  sources: ReadonlyMap<string, WorkspaceAnalysisCanonicalRow[]>,
) {
  return {
    filters: renderFilters(plan, sources),
    blocks: renderBlocks(plan, sources),
  };
}

function renderFilters(
  plan: WorkspaceAnalysisExecutionPlan,
  sources: ReadonlyMap<string, WorkspaceAnalysisCanonicalRow[]>,
): WorkspaceAnalysisRuntimeFilter[] {
  return plan.definition.filters.map((filter) => {
    const base = {
      key: filter.key,
      label: filter.label,
      kind: filter.kind,
      value: plan.filterValues[filter.key] ?? "",
    };
    if (filter.kind === "select") return { ...base, options: filter.options ?? [] };
    if (filter.kind === "month") {
      return {
        ...base,
        options: Array.from({ length: 12 }, (_, index) => ({ label: `${index + 1}月`, value: String(index + 1) })),
      };
    }
    if (filter.kind === "year") {
      const years = new Set<number>();
      for (const row of sources.get(filter.source) ?? []) {
        const parts = parseWorkspaceAnalysisDateParts(row[filter.field]);
        if (parts) years.add(parts.year);
      }
      return {
        ...base,
        options: [...years].sort((left, right) => right - left).map((year) => ({ label: `${year}年`, value: String(year) })),
      };
    }
    return base;
  });
}

function renderBlocks(
  plan: WorkspaceAnalysisExecutionPlan,
  sources: ReadonlyMap<string, WorkspaceAnalysisCanonicalRow[]>,
): WorkspaceAnalysisRuntimeBlock[] {
  let tableRows = 0;
  let chartGroups = 0;
  return plan.definition.blocks.map((block): WorkspaceAnalysisRuntimeBlock => {
    if (block.kind === "note") return { ...block };
    const source = plan.sources.find((candidate) => candidate.alias === block.source)!;
    const allRows = sources.get(block.source) ?? [];
    const rows = applyFilters(plan, allRows, block.source);

    if (block.kind === "metrics") {
      return {
        key: block.key,
        kind: "metrics",
        metrics: block.metrics.map((metric) => ({
          key: metric.key,
          label: metric.label,
          value: aggregateMetric(rows, metric),
          format: metricFormat(metric, source),
        })),
      };
    }

    if (block.kind === "table") {
      const displayed = rows.slice(0, block.limit ?? 100);
      tableRows += displayed.length;
      if (tableRows > plan.limits.maxTableRows) {
        throw runtimeError("run_limit_exceeded", "经营分析运行超过 500 个表格行", source.sourceKey);
      }
      return {
        key: block.key,
        kind: "table",
        title: block.title,
        totalRows: rows.length,
        columns: block.columns.map((column) => ({
          key: column.key,
          label: column.label,
          format: column.format ?? fieldFormat(source, column.field),
        })),
        rows: displayed.map((row, index) => ({
          key: `${block.key}-${index + 1}`,
          cells: Object.fromEntries(block.columns.map((column) => [column.key, row[column.field] ?? null])),
        })),
      };
    }

    const comparisonRows = applyFilters(plan, allRows, block.source, block.dimension.field);
    const currentGroups = groupRows(rows, block.dimension.field, block.dimension.bucket);
    const comparisonGroups = groupRows(comparisonRows, block.dimension.field, block.dimension.bucket);
    if (currentGroups.size > source.limits.maxGroups || comparisonGroups.size > source.limits.maxGroups) {
      throw runtimeError("source_limit_exceeded", `${source.definition.label}超过登记分组上限`, source.sourceKey);
    }
    const sorted = sortGroups([...currentGroups.values()], block.metrics[0]!, block.sort ?? "dimensionAsc");
    const groups = sorted.slice(0, block.limit ?? 36);
    chartGroups += groups.length;
    if (chartGroups > plan.limits.maxChartGroups) {
      throw runtimeError("run_limit_exceeded", "经营分析运行超过 60 个图表分组", source.sourceKey);
    }
    const comparison = block.comparison ?? "none";
    return {
      key: block.key,
      kind: "chart",
      title: block.title,
      dimensionLabel: block.dimension.label ?? fieldLabel(source, block.dimension.field),
      comparison,
      metrics: block.metrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        format: metricFormat(metric, source),
      })),
      groups: groups.map((group) => ({
        key: group.key,
        label: group.label,
        values: block.metrics.map((metric) => {
          const value = { metricKey: metric.key, current: aggregateMetric(group.rows, metric) };
          if (!block.dimension.bucket || comparison === "none") return value;
          const periodKey = previousDimensionKey(group.key, block.dimension.bucket, "period");
          const yearKey = previousDimensionKey(group.key, block.dimension.bucket, "year");
          return {
            ...value,
            ...((comparison === "periodOverPeriod" || comparison === "both") && periodKey
              ? { previousPeriod: aggregateMetric(comparisonGroups.get(periodKey)?.rows ?? [], metric) }
              : {}),
            ...((comparison === "yearOverYear" || comparison === "both") && yearKey
              ? { previousYear: aggregateMetric(comparisonGroups.get(yearKey)?.rows ?? [], metric) }
              : {}),
          };
        }),
      })),
    };
  });
}

function applyFilters(
  plan: WorkspaceAnalysisExecutionPlan,
  rows: readonly WorkspaceAnalysisCanonicalRow[],
  sourceAlias: string,
  omittedDateField?: string,
) {
  return rows.filter((row) => plan.definition.filters.every((filter) => {
    if (filter.source !== sourceAlias) return true;
    if (omittedDateField === filter.field && (filter.kind === "year" || filter.kind === "month")) return true;
    const selected = plan.filterValues[filter.key] ?? "";
    if (!selected) return true;
    const value = row[filter.field];
    if (filter.kind === "search") return matchText(String(value ?? ""), selected);
    if (filter.kind === "select") return String(value ?? "") === selected;
    const parts = parseWorkspaceAnalysisDateParts(value);
    if (!parts) return false;
    return filter.kind === "year" ? parts.year === Number(selected) : parts.month === Number(selected);
  }));
}

function aggregateMetric(rows: readonly WorkspaceAnalysisCanonicalRow[], metric: WorkspaceSourcesMetric) {
  if (metric.operation === "count") {
    return metric.field ? rows.filter((row) => hasValue(row[metric.field!])).length : rows.length;
  }
  const values = rows.map((row) => row[metric.field!]).filter(hasValue);
  if (metric.operation === "distinctCount") return new Set(values.map(String)).size;
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!numbers.length) return 0;
  if (metric.operation === "sum") return numbers.reduce((sum, value) => sum + value, 0);
  if (metric.operation === "average") return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  if (metric.operation === "min") return Math.min(...numbers);
  return Math.max(...numbers);
}

function groupRows(rows: readonly WorkspaceAnalysisCanonicalRow[], field: string, bucket?: "year" | "quarter" | "month") {
  const groups = new Map<string, { key: string; label: string; rows: WorkspaceAnalysisCanonicalRow[] }>();
  for (const row of rows) {
    const dimension = dimensionValue(row[field], bucket);
    if (!dimension) continue;
    const group = groups.get(dimension.key);
    if (group) group.rows.push(row);
    else groups.set(dimension.key, { ...dimension, rows: [row] });
  }
  return groups;
}

function dimensionValue(value: WorkspaceAnalysisRuntimeValue | undefined, bucket?: "year" | "quarter" | "month") {
  if (!bucket) {
    if (!hasValue(value)) return { key: "unknown", label: "未知" };
    if (typeof value === "boolean") return { key: String(value), label: value ? "是" : "否" };
    return { key: String(value), label: String(value) };
  }
  const parts = parseWorkspaceAnalysisDateParts(value);
  if (!parts) return null;
  if (bucket === "year") return { key: String(parts.year), label: `${parts.year}年` };
  if (bucket === "quarter") {
    const quarter = Math.floor((parts.month - 1) / 3) + 1;
    return { key: `${parts.year}-${String(quarter).padStart(2, "0")}`, label: `${parts.year}年Q${quarter}` };
  }
  return { key: `${parts.year}-${String(parts.month).padStart(2, "0")}`, label: `${parts.year}年${parts.month}月` };
}

function previousDimensionKey(key: string, bucket: "year" | "quarter" | "month", comparison: "period" | "year") {
  const [yearText, periodText] = key.split("-");
  const year = Number(yearText);
  const period = Number(periodText);
  if (!Number.isInteger(year)) return null;
  if (bucket === "year") return String(year - 1);
  if (!Number.isInteger(period)) return null;
  if (comparison === "year") return `${year - 1}-${String(period).padStart(2, "0")}`;
  if (bucket === "quarter") return period > 1 ? `${year}-${String(period - 1).padStart(2, "0")}` : `${year - 1}-04`;
  return period > 1 ? `${year}-${String(period - 1).padStart(2, "0")}` : `${year - 1}-12`;
}

function sortGroups(
  groups: Array<{ key: string; label: string; rows: WorkspaceAnalysisCanonicalRow[] }>,
  metric: WorkspaceSourcesMetric,
  sort: "dimensionAsc" | "dimensionDesc" | "valueAsc" | "valueDesc",
) {
  return groups.sort((left, right) => {
    if (sort === "dimensionAsc") return left.key.localeCompare(right.key);
    if (sort === "dimensionDesc") return right.key.localeCompare(left.key);
    const delta = aggregateMetric(left.rows, metric) - aggregateMetric(right.rows, metric);
    return sort === "valueAsc" ? delta : -delta;
  });
}

function metricFormat(metric: WorkspaceSourcesMetric, source: WorkspaceAnalysisExecutionSourcePlan) {
  if (metric.format) return metric.format;
  if (metric.operation === "count" || metric.operation === "distinctCount") return "integer" as const;
  const kind = source.definition.fields.find((field) => field.key === metric.field)?.kind;
  if (kind === "currency" || kind === "percent" || kind === "integer") return kind;
  return "number" as const;
}

function fieldFormat(source: WorkspaceAnalysisExecutionSourcePlan, fieldKey: string) {
  const kind = source.definition.fields.find((field) => field.key === fieldKey)?.kind;
  if (!kind || kind === "boolean") return "text" as const;
  return kind;
}

function fieldLabel(source: WorkspaceAnalysisExecutionSourcePlan, fieldKey: string) {
  return source.definition.fields.find((field) => field.key === fieldKey)?.label ?? fieldKey;
}

export function parseWorkspaceAnalysisDateParts(value: unknown) {
  if (typeof value !== "string") return null;
  const direct = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!direct) return null;
  const year = Number(direct[1]);
  const month = Number(direct[2]);
  const day = Number(direct[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
    ? { year, month }
    : null;
}

function hasValue(value: unknown): value is string | number | boolean {
  return value !== null && value !== undefined && value !== "";
}

function runtimeError(
  code: ConstructorParameters<typeof WorkspaceAnalysisRuntimeError>[0],
  message: string,
  sourceKey?: string,
) {
  return new WorkspaceAnalysisRuntimeError(code, message, sourceKey);
}
