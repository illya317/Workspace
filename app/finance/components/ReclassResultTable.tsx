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
    <table className="min-w-full text-left text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
        <tr>
          <th className="whitespace-nowrap px-4 py-3 font-medium">凭证号</th>
          <th className="whitespace-nowrap px-4 py-3 font-medium">日期</th>
          <th className="whitespace-nowrap px-4 py-3 font-medium">关联实体</th>
          <th className="whitespace-nowrap px-4 py-3 font-medium">原科目</th>
          <th className="whitespace-nowrap px-4 py-3 font-medium">目标科目</th>
          <th className="whitespace-nowrap px-4 py-3 text-right font-medium">金额</th>
          <th className="whitespace-nowrap px-4 py-3 font-medium">状态</th>
          <th className="max-w-[120px] whitespace-nowrap px-4 py-3 font-medium">备注</th>
          <th className="whitespace-nowrap px-4 py-3 font-medium">审核人</th>
          <th className="whitespace-nowrap px-4 py-3 font-medium">审核时间</th>
          {canWrite && <th className="whitespace-nowrap px-4 py-3 font-medium">操作</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-slate-800">
        {items.map((r) => {
          const st = STATUS_MAP[r.status] || { label: r.status, cls: "" };
          return (
            <tr key={r.id} className="hover:bg-emerald-50/20">
              <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">{r.voucherNo}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.voucherDate}</td>
              <td className="max-w-[140px] truncate whitespace-nowrap px-4 py-3 text-slate-600" title={r.relatedEntity || undefined}>{r.relatedEntity || "-"}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">{r.sourceAccount}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">{r.targetAccount}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{fmt(r.amount)}</td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className={`rounded px-1.5 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
              </td>
              <td className="max-w-[120px] truncate px-4 py-3 text-slate-500" title={r.note || undefined}>{r.note || "-"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.adjustedByName || "-"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{r.adjustedAt ? r.adjustedAt.slice(0, 10) : "-"}</td>
              {canWrite && (
                <td className="whitespace-nowrap px-4 py-3">
                  {r.status === "pending" && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => onApprove(r.id)} className="rounded px-1.5 py-0.5 text-xs text-emerald-600 hover:bg-emerald-50">通过</button>
                      <button onClick={() => onAdjust(r)} className="rounded px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50">调整</button>
                      <button onClick={() => onReject(r.id)} className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50">驳回</button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          );
        })}
        {items.length === 0 && (
          <tr>
            <td colSpan={canWrite ? 11 : 10} className="px-4 py-8 text-center text-gray-400">
              暂无重分类审核记录
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
