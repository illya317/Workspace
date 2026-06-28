"use client";

import { PageSurface, createMessageBlock, type DataSurfaceCellSpec, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { SourceTraceInfo } from "../types";
export type CostRecord = Record<string, unknown>;
export type CostColumn = DataSurfaceColumnSpec<CostRecord>;
interface CostDataTableProps {
  rows: CostRecord[];
  columns: CostColumn[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    total: number;
    totalPages: number;
  };
  page: number;
  onPageChange: (page: number) => void;
  rowKey?: (row: CostRecord) => string;
}
export function formatCostNumber(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("zh-CN", {
    maximumFractionDigits: 2
  });
}
export function sourceTraceFromRow(row: CostRecord): SourceTraceInfo {
  return {
    sourceFile: String(row.sourceFile ?? ""),
    sourceSheet: row.sourceSheet ? String(row.sourceSheet) : null,
    sourceRow: row.sourceRow ? Number(row.sourceRow) : null
  };
}
export function CostTraceButton({
  row,
  onTrace
}: {
  row: CostRecord;
  onTrace: (info: SourceTraceInfo) => void;
}): DataSurfaceCellSpec {
  return {
    kind: "action",
    action: {
      key: "trace",
      label: "查看",
      size: "sm",
      className: "border-0 bg-transparent p-0 text-xs text-emerald-600 shadow-none hover:bg-transparent hover:underline",
      onClick: () => onTrace(sourceTraceFromRow(row)),
    },
  };
}
export default function CostDataTable({
  rows,
  columns,
  loading,
  error,
  pagination,
  page,
  onPageChange,
  rowKey = row => String(row.id)
}: CostDataTableProps) {
  return (
    <PageSurface
      kind="list"
      embedded
      body={{
        layout: "single",
        blocks: [
          ...(loading ? [createMessageBlock("loading", {
            content: "加载中…",
            tone: "muted" as const,
            className: "text-sm text-gray-500",
          })] : []),
          ...(error ? [createMessageBlock("error", {
            content: error,
            tone: "danger" as const,
            className: "text-sm text-red-500",
          })] : []),
          {
            kind: "data",
            key: "cost-table",
            surface: {
              kind: "table",
              framed: true,
              bodyClassName: "overflow-x-auto",
              rows,
              columns,
              visibleColumns: columns.map(column => column.key),
              rowKey,
              emptyText: "暂无数据",
            },
          },
        ],
      }}
      footer={{ pagination: { page, total: pagination.total, totalPages: pagination.totalPages, onPageChange, className: "flex items-center justify-between text-sm", compact: true } }}
    />
  );
}
