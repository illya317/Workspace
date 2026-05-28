"use client";

import { useState } from "react";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState, SourceTraceInfo } from "../types";
import SourceTraceModal from "./SourceTraceModal";

interface Props {
  filters: CostFiltersState;
}

export default function CostAnalysisTable({ filters }: Props) {
  const [page, setPage] = useState(1);
  const { data, pagination, loading, error } = useCostData({
    endpoint: "cost-analysis",
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
      {loading && <p className="text-sm text-gray-500">加载中…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
            <tr>
              <th className="px-3 py-2">表名</th>
              <th className="px-3 py-2">行标签</th>
              <th className="px-3 py-2">指标</th>
              <th className="px-3 py-2 text-right">数值</th>
              <th className="px-3 py-2">来源</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data as Record<string, unknown>[]).map((row) => (
              <tr key={String(row.id)} className="hover:bg-gray-50">
                <td className="px-3 py-2">{String(row.tableName ?? "—")}</td>
                <td className="px-3 py-2">{String(row.rowLabel ?? "—")}</td>
                <td className="px-3 py-2">{String(row.metricName ?? row.metricKey ?? "—")}</td>
                <td className="px-3 py-2 text-right">{fmt(row.value as number)}</td>
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
        
        onClose={() => setTrace({ ...trace, open: false })}
      />
    </div>
  );
}
