"use client";

import { useState } from "react";
import { createPageBody, PageSurface, createPageDataBlock, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState, SourceTraceInfo } from "../types";
import CostDataTable, { CostTraceButton, formatCostNumber, type CostRecord } from "./CostDataTable";
import SourceTraceModal from "./SourceTraceModal";

interface Props {
  filters: CostFiltersState;
}

export default function ShipmentTable({ filters }: Props) {
  const [page, setPage] = useState(1);
  const [trace, setTrace] = useState<{ open: boolean; info: SourceTraceInfo | null }>({ open: false, info: null });
  const { data, summary, pagination, loading, error } = useCostData<CostRecord>({
    endpoint: "shipments",
    filters,
    page,
    pageSize: 50,
  });

  const columns: DataSurfaceColumnSpec<CostRecord>[] = [
    { key: "date", label: "日期", required: true, cell: (row) => String(row.date ?? "—") },
    { key: "customerName", label: "客户", required: true, cell: (row) => String(row.customerName ?? "—") },
    { key: "employeeName", label: "业务员", required: true, cell: (row) => String(row.employeeName ?? "厂家直销") },
    { key: "productName", label: "产品", required: true, cell: (row) => String(row.productName ?? "—") },
    { key: "spec", label: "规格", required: true, cell: (row) => String(row.spec ?? "—") },
    { key: "quantity", label: "数量", required: true, align: "right",  cell: (row) => formatCostNumber(row.quantity as number) },
    { key: "amount", label: "金额", required: true, align: "right",  cell: (row) => formatCostNumber(row.amount as number) },
    { key: "receivedAmount", label: "已回款", required: true, align: "right",  cell: (row) => formatCostNumber(row.receivedAmount as number) },
    { key: "source", label: "来源", required: true, cell: (row) => CostTraceButton({ row, onTrace: (info) => setTrace({ open: true, info }) }) },
  ];

  return (
    <div className="space-y-4">
      {summary && (
        <PageSurface
          kind="analysis"
          embedded
          body={createPageBody([
            createPageDataBlock("shipment-summary", {
              kind: "metrics",
              metrics: [
                { key: "amount", label: "发货金额", value: formatCostNumber(summary.totalAmount as number) },
                { key: "received", label: "已回款", value: formatCostNumber(summary.totalReceived as number) },
                { key: "unreceived", label: "未回款", value: formatCostNumber(summary.totalUnreceived as number) },
                { key: "rate", label: "回款率", value: `${(((summary.collectionRate as number) ?? 0) * 100).toFixed(1)}%` },
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
