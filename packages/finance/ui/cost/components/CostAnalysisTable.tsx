"use client";

import { useState } from "react";
import { createPageBody, PageSurface, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { BodySurfaceModalSpec, BodySurfaceSectionSpec, PageSurfaceFooterSpec } from "@workspace/core/ui";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState, SourceTraceInfo } from "../types";
import { CostTraceButton, createCostDataSurface, formatCostNumber, type CostRecord } from "./CostDataTable";
import { createSourceTraceModal } from "./SourceTraceModal";

interface Props {
  filters: CostFiltersState;
}

export default function CostAnalysisTable({ filters }: Props) {
  const surface = useCostAnalysisSurface(filters);
  return <PageSurface kind="standard" embedded body={createPageBody([...surface.sections, ...surface.modals])} footer={surface.footer} />;
}

export function useCostAnalysisSurface(filters: CostFiltersState): {
  sections: BodySurfaceSectionSpec[];
  footer?: PageSurfaceFooterSpec;
  modals: BodySurfaceModalSpec[];
} {
  const [page, setPage] = useState(1);
  const [trace, setTrace] = useState<{ open: boolean; info: SourceTraceInfo | null }>({ open: false, info: null });
  const { data, pagination, loading, error } = useCostData<CostRecord>({
    endpoint: "cost-analysis",
    filters,
    page,
    pageSize: 50,
  });

  const columns: DataSurfaceColumnSpec<CostRecord>[] = [
    { key: "tableName", label: "表名", required: true, cell: (row) => String(row.tableName ?? "—") },
    { key: "rowLabel", label: "行标签", required: true, cell: (row) => String(row.rowLabel ?? "—") },
    { key: "metricName", label: "指标", required: true, cell: (row) => String(row.metricName ?? row.metricKey ?? "—") },
    { key: "value", label: "数值", required: true, align: "right",  cell: (row) => formatCostNumber(row.value as number) },
    { key: "source", label: "来源", required: true, cell: (row) => CostTraceButton({ row, onTrace: (info) => setTrace({ open: true, info }) }) },
  ];

  const table = createCostDataSurface({ rows: data, columns, loading, error, pagination, page, onPageChange: setPage });
  const modal = createSourceTraceModal({ open: trace.open, info: trace.info, onClose: () => setTrace({ ...trace, open: false }) });
  return { sections: table.sections, footer: table.footer, modals: modal ? [modal] : [] };
}
