"use client";

import { useState } from "react";
import { createPageBody, PageSurface, createMetricsSection, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { BodySurfaceModalSpec, BodySurfaceSectionSpec, PageSurfaceFooterSpec } from "@workspace/core/ui";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState, SourceTraceInfo } from "../types";
import { createCostDataSurface, createCostTraceAction, formatCostNumber, type CostRecord } from "./CostDataTable";
import { createSourceTraceModal } from "./SourceTraceModal";

interface Props {
  filters: CostFiltersState;
}

export default function WorkshopReportTable({ filters }: Props) {
  const surface = useWorkshopReportSurface(filters);
  return <PageSurface kind="standard" embedded body={createPageBody([...surface.sections, ...surface.modals])} footer={surface.footer} />;
}

export function useWorkshopReportSurface(filters: CostFiltersState): {
  sections: BodySurfaceSectionSpec[];
  footer?: PageSurfaceFooterSpec;
  modals: BodySurfaceModalSpec[];
} {
  const [page, setPage] = useState(1);
  const [trace, setTrace] = useState<{ open: boolean; info: SourceTraceInfo | null }>({ open: false, info: null });
  const { data, summary, pagination, loading, error } = useCostData<CostRecord>({
    endpoint: "workshop",
    filters,
    page,
    pageSize: 50,
  });

  const columns: DataSurfaceColumnSpec<CostRecord>[] = [
    { key: "period", label: "年月", required: true, cell: (row) => `${String(row.year)}-${String(row.month)}` },
    { key: "productName", label: "产品", required: true, cell: (row) => String(row.productName ?? "—") },
    { key: "batchNo", label: "批号", required: true, cell: (row) => String(row.batchNo ?? "—") },
    { key: "employeeName", label: "人员", required: true, cell: (row) => String(row.employeeName ?? "—") },
    { key: "positionName", label: "工种", required: true, cell: (row) => String(row.positionName ?? "—") },
    { key: "workPoint", label: "工分", required: true, align: "right",  cell: (row) => formatCostNumber(row.workPoint as number) },
    { key: "quantity", label: "数量", required: true, align: "right",  cell: (row) => formatCostNumber(row.quantity as number) },
  ];

  const table = createCostDataSurface({
    rows: data,
    columns,
    loading,
    error,
    pagination,
    page,
    onPageChange: setPage,
    rowActions: (row) => [createCostTraceAction({ row, onTrace: (info) => setTrace({ open: true, info }) })],
  });
  const modal = createSourceTraceModal({ open: trace.open, info: trace.info, onClose: () => setTrace({ ...trace, open: false }) });
  return {
    sections: [
      ...(summary
        ? [createMetricsSection("workshop-summary", {
            metrics: [
              { key: "work-points", label: "总工分", value: formatCostNumber(summary.totalWorkPoints as number) },
              { key: "quantity", label: "总数量", value: formatCostNumber(summary.totalQuantity as number) },
            ],
          })]
        : []),
      ...table.sections,
    ],
    footer: table.footer,
    modals: modal ? [modal] : [],
  };
}
