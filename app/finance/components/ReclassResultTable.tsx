"use client";

import type { ReclassResultRow } from "@workspace/finance/server/ledger/reclass-results/types";

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: "待审核", cls: "bg-yellow-100 text-yellow-700" },
  approved: { label: "已通过", cls: "bg-emerald-100 text-emerald-700" },
  adjusted: { label: "已调整", cls: "bg-blue-100 text-blue-700" },
  rejected: { label: "已驳回", cls: "bg-red-100 text-red-700" },
};

interface Props {
  items: ReclassResultRow[];
  loading?: boolean;
  canWrite: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onAdjust: (item: ReclassResultRow) => void;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReclassResultTable({
  items, loading, canWrite, onApprove, onReject, onAdjust,
}: Props) {
  if (loading) {
    return <p className="p-8 text-center text-gray-500">加载中...</p>;
  }

  return (
    <table className="w-full text-xs">
      <thead className="border-b bg-gray-50">
        <tr>
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">凭证号</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">日期</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">关联实体</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">原科目</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">目标科目</th>
          <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">金额</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">状态</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap max-w-[120px]">备注</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">审核人</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">审核时间</th>
          {canWrite && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">操作</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((r) => {
          const st = STATUS_MAP[r.status] || { label: r.status, cls: "" };
          return (
            <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.voucherNo}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.voucherDate}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[140px] truncate" title={r.relatedEntity || undefined}>{r.relatedEntity || "-"}</td>
              <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.sourceAccount}</td>
              <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.targetAccount}</td>
              <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{fmt(r.amount)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className={`rounded px-1.5 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
              </td>
              <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate" title={r.note || undefined}>{r.note || "-"}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.adjustedByName || "-"}</td>
              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.adjustedAt ? r.adjustedAt.slice(0, 10) : "-"}</td>
              {canWrite && (
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.status === "pending" && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => onApprove(r.id)} className="rounded px-1.5 py-0.5 text-[11px] text-emerald-600 hover:bg-emerald-50">通过</button>
                      <button onClick={() => onAdjust(r)} className="rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50">调整</button>
                      <button onClick={() => onReject(r.id)} className="rounded px-1.5 py-0.5 text-[11px] text-red-500 hover:bg-red-50">驳回</button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          );
        })}
        {items.length === 0 && (
          <tr>
            <td colSpan={canWrite ? 11 : 10} className="px-3 py-8 text-center text-gray-400">
              暂无重分类审核记录
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
