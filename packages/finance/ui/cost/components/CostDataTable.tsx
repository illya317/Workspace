"use client";

import { PageSurface, createMessageSection, createPageBody, type DataSurfaceCellSpec, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceFooterSpec } from "@workspace/core/ui";
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
export type CostDataSurfaceSpec = {
  sections: BodySurfaceSectionSpec[];
  footer: PageSurfaceFooterSpec;
};
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
  const surface = createCostDataSurface({ rows, columns, loading, error, pagination, page, onPageChange, rowKey });
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody(surface.sections, { layout: "stack" })}
      footer={surface.footer}
    />
  );
}

export function createCostDataSurface({
  rows,
  columns,
  loading,
  error,
  pagination,
  page,
  onPageChange,
  rowKey = row => String(row.id)
}: CostDataTableProps): CostDataSurfaceSpec {
  return {
    sections: [
      ...(loading ? [createMessageSection("loading", {
        content: "加载中…",
        tone: "muted" as const,

      })] : []),
      ...(error ? [createMessageSection("error", {
        content: error,
        tone: "danger" as const,

      })] : []),
      {
        key: "cost-table",
        body: { kind: "data", data: {
          kind: "table",

          rows,
          columns,
          visibleColumns: columns.map(column => column.key),
          rowKey,
          emptyText: "暂无数据",
        } },
      },
    ],
    footer: { pagination: { page, total: pagination.total, totalPages: pagination.totalPages, onPageChange,  compact: true } },
  };
}
