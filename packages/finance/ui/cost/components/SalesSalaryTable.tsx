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

export default function SalesSalaryTable({ filters }: Props) {
  const [page, setPage] = useState(1);
  const [trace, setTrace] = useState<{ open: boolean; info: SourceTraceInfo | null }>({ open: false, info: null });
  const { data, summary, pagination, loading, error } = useCostData<CostRecord>({
    endpoint: "sales-salary",
    filters,
    page,
    pageSize: 50,
  });

  const columns: DataSurfaceColumnSpec<CostRecord>[] = [
    { key: "period", label: "年月", required: true, cell: (row) => `${String(row.year)}-${row.month != null ? String(row.month) : "—"}` },
    { key: "employeeName", label: "业务员", required: true, cell: (row) => String(row.employeeName ?? "厂销") },
    { key: "baseSalary", label: "基本工资", required: true, align: "right",  cell: (row) => formatCostNumber(row.baseSalary as number) },
    { key: "bonus", label: "提成/奖金", required: true, align: "right",  cell: (row) => formatCostNumber(row.bonus as number) },
    { key: "actualSalary", label: "实发工资", required: true, align: "right",  cell: (row) => formatCostNumber(row.actualSalary as number) },
    { key: "source", label: "来源", required: true, cell: (row) => CostTraceButton({ row, onTrace: (info) => setTrace({ open: true, info }) }) },
  ];

  return (
    <div className="space-y-4">
      {summary && (
        <PageSurface kind="standard"
          embedded
          body={createPageBody([
            createPageDataSection("sales-salary-summary", {
              kind: "metrics",
              metrics: [
                { key: "base", label: "基本工资合计", value: formatCostNumber(summary.totalBaseSalary as number) },
                { key: "bonus", label: "提成合计", value: formatCostNumber(summary.totalBonus as number) },
                { key: "actual", label: "实发工资合计", value: formatCostNumber(summary.totalActualSalary as number) },
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
