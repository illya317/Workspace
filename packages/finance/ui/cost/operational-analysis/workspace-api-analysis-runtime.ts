import type {
  WorkspaceApiFilter,
  WorkspaceApiMetric,
  WorkspaceApiValueFormat,
} from "@workspace/finance/types";
import { matchText } from "@workspace/platform/search";
import {
  extractWorkspaceAnalysisSourceRows,
  readWorkspaceAnalysisSourceValue,
  type WorkspaceAnalysisSourceRow,
} from "@workspace/platform/ui/workspace-analysis-source-runtime";

export type WorkspaceApiRow = WorkspaceAnalysisSourceRow;
export type WorkspaceApiFilterValues = Record<string, string>;
export type WorkspaceApiDateBucket = "year" | "quarter" | "month";

export const readWorkspaceApiValue = readWorkspaceAnalysisSourceValue;
export const extractWorkspaceApiRows = extractWorkspaceAnalysisSourceRows;

export function defaultWorkspaceApiFilterValues(filters: WorkspaceApiFilter[]): WorkspaceApiFilterValues {
  return Object.fromEntries(filters.map((filter) => [filter.key, filter.defaultValue ?? ""]));
}

export function applyWorkspaceApiFilters(
  rows: WorkspaceApiRow[],
  filters: WorkspaceApiFilter[],
  values: WorkspaceApiFilterValues,
  source: string,
  options: { omitDateField?: string } = {},
) {
  return rows.filter((row) => filters.every((filter) => {
    if (filter.source !== source) return true;
    if (options.omitDateField === filter.field && (filter.kind === "year" || filter.kind === "month")) return true;
    const selected = values[filter.key]?.trim() ?? "";
    if (!selected || selected === "__all") return true;
    const fieldValue = readWorkspaceApiValue(row, filter.field);
    if (filter.kind === "search") return matchText(String(fieldValue ?? ""), selected);
    if (filter.kind === "select") return String(fieldValue ?? "") === selected;
    const date = parseWorkspaceApiDate(fieldValue);
    if (!date) return false;
    return filter.kind === "year"
      ? date.getFullYear() === Number(selected)
      : date.getMonth() + 1 === Number(selected);
  }));
}

export function aggregateWorkspaceApiMetric(rows: WorkspaceApiRow[], metric: WorkspaceApiMetric) {
  if (metric.operation === "count") {
    if (!metric.field) return rows.length;
    return rows.filter((row) => hasWorkspaceApiValue(readWorkspaceApiValue(row, metric.field!))).length;
  }
  const rawValues = rows.map((row) => readWorkspaceApiValue(row, metric.field!));
  if (metric.operation === "distinctCount") {
    return new Set(rawValues.filter(hasWorkspaceApiValue).map((value) => String(value))).size;
  }
  const values = rawValues.map(toFiniteNumber).filter((value): value is number => value !== null);
  if (!values.length) return 0;
  if (metric.operation === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (metric.operation === "average") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (metric.operation === "min") return Math.min(...values);
  return Math.max(...values);
}

export function formatWorkspaceApiValue(value: unknown, format: WorkspaceApiValueFormat = "text") {
  if (!hasWorkspaceApiValue(value)) return "—";
  if (format === "date") {
    const date = parseWorkspaceApiDate(value);
    return date ? date.toLocaleDateString("zh-CN") : String(value);
  }
  if (format === "text") return typeof value === "boolean" ? (value ? "是" : "否") : String(value);
  const number = toFiniteNumber(value);
  if (number === null) return String(value);
  if (format === "currency") {
    return number.toLocaleString("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 });
  }
  if (format === "percent") {
    return number.toLocaleString("zh-CN", { style: "percent", maximumFractionDigits: 1 });
  }
  if (format === "integer") return Math.round(number).toLocaleString("zh-CN");
  return number.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function groupWorkspaceApiRows(
  rows: WorkspaceApiRow[],
  field: string,
  bucket?: WorkspaceApiDateBucket,
) {
  const groups = new Map<string, { key: string; label: string; rows: WorkspaceApiRow[] }>();
  for (const row of rows) {
    const dimension = workspaceApiDimension(readWorkspaceApiValue(row, field), bucket);
    if (!dimension) continue;
    const existing = groups.get(dimension.key);
    if (existing) existing.rows.push(row);
    else groups.set(dimension.key, { ...dimension, rows: [row] });
  }
  return groups;
}

export function previousWorkspaceApiDimensionKey(
  key: string,
  bucket: WorkspaceApiDateBucket,
  comparison: "period" | "year",
) {
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

function workspaceApiDimension(value: unknown, bucket?: WorkspaceApiDateBucket) {
  if (!bucket) {
    if (!hasWorkspaceApiValue(value)) return { key: "unknown", label: "未知" };
    return { key: String(value), label: String(value) };
  }
  const date = parseWorkspaceApiDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  if (bucket === "year") return { key: String(year), label: `${year}年` };
  if (bucket === "quarter") {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return { key: `${year}-${String(quarter).padStart(2, "0")}`, label: `${year}年Q${quarter}` };
  }
  const month = date.getMonth() + 1;
  return { key: `${year}-${String(month).padStart(2, "0")}`, label: `${year}年${month}月` };
}

function parseWorkspaceApiDate(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasWorkspaceApiValue(value: unknown): value is string | number | boolean {
  return value !== null && value !== undefined && value !== "";
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
