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

export default function CostStructureTable({ filters }: Props) {
  const surface = useCostStructureSurface(filters);
  return <PageSurface kind="standard" embedded body={createPageBody([...surface.sections, ...surface.modals])} footer={surface.footer} />;
}

export function useCostStructureSurface(filters: CostFiltersState): {
  sections: BodySurfaceSectionSpec[];
  footer?: PageSurfaceFooterSpec;
  modals: BodySurfaceModalSpec[];
} {
  const [page, setPage] = useState(1);
  const [trace, setTrace] = useState<{ open: boolean; info: SourceTraceInfo | null }>({ open: false, info: null });
  const { data, summary, pagination, loading, error } = useCostData<CostRecord>({
    endpoint: "cost-structure",
    filters,
    page,
    pageSize: 50,
  });

  const columns: DataSurfaceColumnSpec<CostRecord>[] = [
    { key: "period", label: "年月", required: true, cell: (row) => `${String(row.year)}-${row.month != null ? String(row.month) : "—"}` },
    { key: "productName", label: "产品", required: true, cell: (row) => String(row.productName ?? "—") },
    { key: "category", label: "类别", required: true, cell: (row) => String(row.category ?? "—") },
    { key: "itemName", label: "项目", required: true, cell: (row) => String(row.itemName ?? "—") },
    { key: "amount", label: "金额", required: true, align: "right",  cell: (row) => formatCostNumber(row.amount as number) },
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
        ? [createMetricsSection("cost-structure-summary", {
            metrics: [
              { key: "amount", label: "成本总额", value: formatCostNumber(summary.totalAmount as number) },
              { key: "quantity", label: "总数量", value: formatCostNumber(summary.totalQuantity as number) },
              { key: "unit", label: "单位成本", value: formatCostNumber(summary.unitCost as number) },
            ],
          })]
        : []),
      ...table.sections,
    ],
    footer: table.footer,
    modals: modal ? [modal] : [],
  };
}
