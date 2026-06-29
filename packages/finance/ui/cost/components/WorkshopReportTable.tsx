"use client";

import { useState } from "react";
import { createPageBody, PageSurface, createPageDataSection, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState, SourceTraceInfo } from "../types";
import CostDataTable, { CostTraceButton, formatCostNumber, type CostRecord } from "./CostDataTable";
import SourceTraceModal from "./SourceTraceModal";

interface Props {
  filters: CostFiltersState;
}

export default function WorkshopReportTable({ filters }: Props) {
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
    { key: "source", label: "来源", required: true, cell: (row) => CostTraceButton({ row, onTrace: (info) => setTrace({ open: true, info }) }) },
  ];

  return (
    <div className="space-y-4">
      {summary && (
        <PageSurface kind="standard"
          embedded
          body={createPageBody([
            createPageDataSection("workshop-summary", {
              kind: "metrics",
              metrics: [
                { key: "work-points", label: "总工分", value: formatCostNumber(summary.totalWorkPoints as number) },
                { key: "quantity", label: "总数量", value: formatCostNumber(summary.totalQuantity as number) },
              ],
            }),
          ])}
        />
      )}
      <CostDataTable
        rows={data}
        columns={columns}
        loading={loading}
        error={error}
        pagination={pagination}
        page={page}
        onPageChange={setPage}
      />
      <SourceTraceModal
        open={trace.open}
        info={trace.info}
        onClose={() => setTrace({ ...trace, open: false })}
      />
    </div>
  );
}
