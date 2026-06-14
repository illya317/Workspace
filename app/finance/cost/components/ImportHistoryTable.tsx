"use client";

import { useState } from "react";
import { useCostData } from "../hooks/useFinanceCostData";
import type { CostFiltersState } from "../types";

interface Props {
  filters: CostFiltersState;
}

export default function ImportHistoryTable({ filters }: Props) {
  const [page, setPage] = useState(1);
  const { data, pagination, loading, error, refetch } = useCostData({
    endpoint: "imports",
    filters,
    page,
    pageSize: 20,
  });

  const [deleting, setDeleting] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除该导入批次？关联数据将被一并删除。")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/workspace/api/finance/cost/imports/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error || "删除失败");
      } else {
        refetch();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      {loading && <p className="text-sm text-gray-500">加载中…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">年份</th>
              <th className="px-3 py-2">源文件</th>
              <th className="px-3 py-2 text-right">记录数</th>
              <th className="px-3 py-2 text-right">警告</th>
              <th className="px-3 py-2">导入时间</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data as Record<string, unknown>[]).map((row) => (
              <tr key={String(row.id)} className="hover:bg-gray-50">
                <td className="px-3 py-2">{String(row.id)}</td>
                <td className="px-3 py-2">{String(row.profile)}</td>
                <td className="px-3 py-2">{row.year ? String(row.year) : "—"}</td>
                <td className="px-3 py-2">{String(row.sourceFile)}</td>
                <td className="px-3 py-2 text-right">{String(row.recordCount)}</td>
                <td className="px-3 py-2 text-right">{String(row.warningCount)}</td>
                <td className="px-3 py-2">
                  {row.importedAt
                    ? new Date(String(row.importedAt)).toLocaleString("zh-CN")
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <button
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    disabled={deleting === row.id}
                    onClick={() => handleDelete(Number(row.id))}
                  >
                    {deleting === row.id ? "删除中…" : "删除"}
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
    </div>
  );
}
