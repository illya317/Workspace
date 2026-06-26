"use client";

import { DataSurface, type DataSurfaceCellSpec, type DataSurfaceColumnSpec, type DataTableColumn } from "@workspace/core/ui";
import type { SourceTraceInfo } from "../types";
export type CostRecord = Record<string, unknown>;
export type CostColumn = DataTableColumn<CostRecord> | DataSurfaceColumnSpec<CostRecord>;
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
  return <div className="space-y-4">
      {loading && <p className="text-sm text-gray-500">加载中…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <DataSurface
        kind="table"
        framed
        bodyClassName="overflow-x-auto"
        rows={rows}
        columns={columns}
        visibleColumns={columns.map(column => column.key)}
        rowKey={rowKey}
        emptyText="暂无数据"
        pagination={{ page, total: pagination.total, totalPages: pagination.totalPages, onPageChange, className: "flex items-center justify-between text-sm", compact: true }}
      />
    </div>;
}
