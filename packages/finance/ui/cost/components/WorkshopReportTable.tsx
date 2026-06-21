"use client";

import { useState } from "react";
import { MetricCard, type DataTableColumn } from "@workspace/core/ui";
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

  const columns: DataTableColumn<CostRecord>[] = [
    { key: "period", label: "年月", required: true, render: (row) => `${String(row.year)}-${String(row.month)}` },
    { key: "productName", label: "产品", required: true, render: (row) => String(row.productName ?? "—") },
    { key: "batchNo", label: "批号", required: true, render: (row) => String(row.batchNo ?? "—") },
    { key: "employeeName", label: "人员", required: true, render: (row) => String(row.employeeName ?? "—") },
    { key: "positionName", label: "工种", required: true, render: (row) => String(row.positionName ?? "—") },
    { key: "workPoint", label: "工分", required: true, className: "text-right", headerClassName: "text-right", render: (row) => formatCostNumber(row.workPoint as number) },
    { key: "quantity", label: "数量", required: true, className: "text-right", headerClassName: "text-right", render: (row) => formatCostNumber(row.quantity as number) },
    { key: "source", label: "来源", required: true, render: (row) => <CostTraceButton row={row} onTrace={(info) => setTrace({ open: true, info })} /> },
  ];

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="总工分" value={formatCostNumber(summary.totalWorkPoints as number)} />
          <MetricCard label="总数量" value={formatCostNumber(summary.totalQuantity as number)} />
        </div>
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
