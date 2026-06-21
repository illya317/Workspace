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

export default function CostStructureTable({ filters }: Props) {
  const [page, setPage] = useState(1);
  const [trace, setTrace] = useState<{ open: boolean; info: SourceTraceInfo | null }>({ open: false, info: null });
  const { data, summary, pagination, loading, error } = useCostData<CostRecord>({
    endpoint: "cost-structure",
    filters,
    page,
    pageSize: 50,
  });

  const columns: DataTableColumn<CostRecord>[] = [
    { key: "period", label: "年月", required: true, render: (row) => `${String(row.year)}-${row.month != null ? String(row.month) : "—"}` },
    { key: "productName", label: "产品", required: true, render: (row) => String(row.productName ?? "—") },
    { key: "category", label: "类别", required: true, render: (row) => String(row.category ?? "—") },
    { key: "itemName", label: "项目", required: true, render: (row) => String(row.itemName ?? "—") },
    { key: "amount", label: "金额", required: true, className: "text-right", headerClassName: "text-right", render: (row) => formatCostNumber(row.amount as number) },
    { key: "quantity", label: "数量", required: true, className: "text-right", headerClassName: "text-right", render: (row) => formatCostNumber(row.quantity as number) },
    { key: "source", label: "来源", required: true, render: (row) => <CostTraceButton row={row} onTrace={(info) => setTrace({ open: true, info })} /> },
  ];

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="成本总额" value={formatCostNumber(summary.totalAmount as number)} />
          <MetricCard label="总数量" value={formatCostNumber(summary.totalQuantity as number)} />
          <MetricCard label="单位成本" value={formatCostNumber(summary.unitCost as number)} />
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
