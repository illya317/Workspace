"use client";

import { useState } from "react";
import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState, SourceTraceInfo } from "../types";
import CostDataTable, { CostTraceButton, formatCostNumber, type CostRecord } from "./CostDataTable";
import SourceTraceModal from "./SourceTraceModal";

interface Props {
  filters: CostFiltersState;
}

export default function CostAnalysisTable({ filters }: Props) {
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
    { key: "value", label: "数值", required: true, className: "text-right", headerClassName: "text-right", cell: (row) => formatCostNumber(row.value as number) },
    { key: "source", label: "来源", required: true, cell: (row) => CostTraceButton({ row, onTrace: (info) => setTrace({ open: true, info }) }) },
  ];

  return (
    <div className="space-y-4">
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
