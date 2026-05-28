"use client";

import { useState } from "react";
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
    rawPayload: string | null;
  }>({ open: false, info: null, rawPayload: null });

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

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
            <tr>
              <th className="px-3 py-2">年月</th>
              <th className="px-3 py-2">业务员</th>
              <th className="px-3 py-2 text-right">基本工资</th>
              <th className="px-3 py-2 text-right">提成/奖金</th>
              <th className="px-3 py-2 text-right">实发工资</th>
              <th className="px-3 py-2">来源</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data as Record<string, unknown>[]).map((row) => (
              <tr key={String(row.id)} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  {String(row.year)}-{row.month != null ? String(row.month) : "—"}
                </td>
                <td className="px-3 py-2">{String(row.salesperson ?? "—")}</td>
                <td className="px-3 py-2 text-right">{fmt(row.baseSalary as number)}</td>
                <td className="px-3 py-2 text-right">{fmt(row.bonus as number)}</td>
                <td className="px-3 py-2 text-right">{fmt(row.actualSalary as number)}</td>
                <td className="px-3 py-2">
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
                        rawPayload: row.rawPayload ? String(row.rawPayload) : null,
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
      </div>

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
        rawPayload={trace.rawPayload}
        onClose={() => setTrace({ ...trace, open: false })}
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-800">{value}</p>
    </div>
  );
}
