"use client";

import { useState } from "react";
import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";
import ReclassReviewModal from "./ReclassReviewModal";
import { REVIEW_HEADERS, fmt, dirBadge, targetDisplay } from "../ledger/reclassColumns";

interface Props {
  items: ReclassResultRow[];
  canWrite: boolean;
  statusFilter: string;
  onReview: (id: number, action: "approve" | "revert" | "adjust", body?: Record<string, unknown>) => void;
  companyCode?: string;
  year?: string;
}

export default function ReclassReviewView({ items, canWrite, statusFilter, onReview, companyCode = "", year = "" }: Props) {
  const [adjustItem, setAdjustItem] = useState<ReclassResultRow | null>(null);
  const filtered = items.filter((r) =>
    statusFilter === "all" ||
    (statusFilter === "confirmed" && r.status !== "pending") ||
    r.status === statusFilter
  );

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b bg-gray-100">
            <tr>
              {REVIEW_HEADERS.map((h,i) => (
                <th key={h} className={`px-3 py-1.5 font-medium text-gray-500 ${h==="异常金额"?"text-right":"text-left"}`}>{h}</th>
              ))}
              {canWrite && <th className="px-3 py-1.5 text-center font-medium text-gray-500">操作</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-1.5 font-mono text-gray-500">{r.voucherNo}</td>
                <td className="px-3 py-1.5 font-mono text-gray-600">{r.sourceAccount}</td>
                <td className="px-3 py-1.5 text-gray-700">{r.sourceAccountName}</td>
                <td className="px-3 py-1.5">{dirBadge(r.abnormalSide)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-gray-700">¥{fmt(r.amount)}</td>
                <td className="px-3 py-1.5">
                  {r.status === "pending"
                    ? <span className="text-gray-500">{targetDisplay(r.targetAccount)}</span>
                    : <span className="text-emerald-700">{targetDisplay(r.targetAccount)}</span>
                  }
                </td>
                {canWrite && (
                  <td className="px-3 py-1.5 text-center">
                    <div className="inline-flex items-center gap-1">
                      {r.status === "pending" && (
                        <button onClick={() => onReview(r.id, "approve")} className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">确认</button>
                      )}
                      <button onClick={() => setAdjustItem(r)} className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100">编辑</button>
                      {r.status !== "pending" && (
                        <button onClick={() => onReview(r.id, "revert")} className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50">清除</button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={canWrite ? 7 : 6} className="px-3 py-8 text-center text-gray-400">无重分类条目</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ReclassReviewModal
        item={adjustItem} open={!!adjustItem}
        companyCode={companyCode} year={year}
        onClose={() => setAdjustItem(null)}
        onSubmit={async (id, targetAccount, amount, note) => { onReview(id, "adjust", { targetAccount, amount, note }); }} />
    </div>
  );
}
