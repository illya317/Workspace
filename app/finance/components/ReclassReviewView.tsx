"use client";

import { useState } from "react";
import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";
import ReclassReviewModal from "./ReclassReviewModal";

interface Props {
  items: ReclassResultRow[];
  canWrite: boolean;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  onReview: (id: number, action: "approve" | "reject" | "adjust", body?: Record<string, unknown>) => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "待审核", approved: "已通过", adjusted: "已调整", rejected: "已驳回",
};
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  approved: "bg-emerald-50 text-emerald-700",
  adjusted: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-red-700",
};
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReclassReviewView({ items, canWrite, statusFilter, onStatusFilter, onReview }: Props) {
  const [adjustItem, setAdjustItem] = useState<ReclassResultRow | null>(null);
  const filtered = items.filter((r) => statusFilter === "all" || r.status === statusFilter);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
          {["all","pending","approved","adjusted","rejected"].map((k) => (
            <button key={k} onClick={() => onStatusFilter(k)}
              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${statusFilter === k ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
              {k === "all" ? "全部" : STATUS_LABEL[k] || k}</button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} 条</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b bg-gray-100">
            <tr>
              {["凭证号","日期","科目","关联实体","目标科目","金额","状态"].map((h,i) => (
                <th key={h} className={`px-3 py-1.5 font-medium text-gray-500 ${i===5?"text-right":"text-left"}`}>{h}</th>
              ))}
              {canWrite && <th className="px-3 py-1.5 text-left font-medium text-gray-500">操作</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-1.5 font-mono text-gray-600">{r.voucherNo}</td>
                <td className="px-3 py-1.5 text-gray-600">{r.voucherDate}</td>
                <td className="px-3 py-1.5 font-mono text-gray-700">{r.sourceAccount}</td>
                <td className="px-3 py-1.5 text-gray-500">{r.relatedEntity || "—"}</td>
                <td className="px-3 py-1.5 font-mono text-gray-600">{r.targetAccount}</td>
                <td className="px-3 py-1.5 text-right font-mono text-gray-700">¥{fmt(r.amount)}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] || ""}`}>
                    {STATUS_LABEL[r.status] || r.status}</span>
                </td>
                {canWrite && (
                  <td className="px-3 py-1.5">
                    {r.status === "pending" ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => onReview(r.id, "approve")} className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">通过</button>
                        <button onClick={() => onReview(r.id, "reject")} className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-100">驳回</button>
                        <button onClick={() => setAdjustItem(r)} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-100">调整</button>
                      </div>
                    ) : null}
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={canWrite ? 8 : 7} className="px-3 py-8 text-center text-gray-400">无重分类条目</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ReclassReviewModal
        item={adjustItem} open={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        onSubmit={async (id, targetAccount, amount) => { onReview(id, "adjust", { targetAccount, amount }); }} />
    </div>
  );
}
