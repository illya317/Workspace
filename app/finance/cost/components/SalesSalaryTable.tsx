"use client";

import { useState } from "react";
import { MetricCard, PanelCard } from "@workspace/core/ui";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState, SourceTraceInfo } from "../types";
import SourceTraceModal from "./SourceTraceModal";

interface Props {
  filters: CostFiltersState;
}

export default function SalesSalaryTable({ filters }: Props) {
  const [page, setPage] = useState(1);
  const { data, summary, pagination, loading, error } = useCostData({
    endpoint: "sales-salary",
    filters,
    page,
    pageSize: 50,
  });

  const [trace, setTrace] = useState<{
    open: boolean;
    info: SourceTraceInfo | null;

  }>({ open: false, info: null });

  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard label="基本工资合计" value={fmt(summary.totalBaseSalary as number)} />
          <SummaryCard label="提成合计" value={fmt(summary.totalBonus as number)} />
          <SummaryCard label="实发工资合计" value={fmt(summary.totalActualSalary as number)} />
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">加载中…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <PanelCard bodyClassName="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-medium">年月</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">业务员</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-medium">基本工资</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-medium">提成/奖金</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-medium">实发工资</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">来源</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {(data as Record<string, unknown>[]).map((row) => (
              <tr key={String(row.id)} className="hover:bg-slate-50/60">
                <td className="whitespace-nowrap px-4 py-3">
                  {String(row.year)}-{row.month != null ? String(row.month) : "—"}
                </td>
                <td className="px-4 py-3">{String(row.employeeName ?? "厂销")}</td>
                <td className="px-4 py-3 text-right">{fmt(row.baseSalary as number)}</td>
                <td className="px-4 py-3 text-right">{fmt(row.bonus as number)}</td>
                <td className="px-4 py-3 text-right">{fmt(row.actualSalary as number)}</td>
                <td className="px-4 py-3">
                  <button
                    className="text-xs text-emerald-600 hover:underline"
                    onClick={() =>
                      setTrace({
                        open: true,
                        info: {
                          sourceFile: String(row.sourceFile ?? ""),
                          sourceSheet: row.sourceSheet ? String(row.sourceSheet) : null,
                          sourceRow: row.sourceRow ? Number(row.sourceRow) : null,
                        },
                      })
                    }
                  >
                    查看
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PanelCard>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            共 {pagination.total} 条，第 {pagination.page}/{pagination.totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-50"
            >
              上一页
            </button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      <SourceTraceModal
        open={trace.open}
        info={trace.info}
        
        onClose={() => setTrace({ ...trace, open: false })}
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <MetricCard label={label} value={value} />;
}
