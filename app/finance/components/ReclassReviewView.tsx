"use client";

import { useState, useMemo } from "react";
import { PanelCard } from "@workspace/core/ui";
import type { ReclassResultRow } from "@workspace/finance/server/ledger/reclass-results/types";
import ReclassReviewModal from "./ReclassReviewModal";
import { REVIEW_HEADERS, fmt, targetDisplay } from "../ledger/reclassColumns";

interface Props {
  items: ReclassResultRow[];
  canWrite: boolean;
  statusFilter: string;
  onReview: (id: number, action: "approve" | "revert" | "adjust" | "mark_pending", body?: Record<string, unknown>, extra?: { periodId?: number; voucherItemId?: number; sourceAccount?: string }) => void;
  companyCode?: string;
  year?: string;
}

type SortKey = "voucherNo" | "sourceAccount" | "amount";
const SORT_LABELS: Record<string, SortKey> = { "凭证号": "voucherNo", "科目编码": "sourceAccount", "金额": "amount" };
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = { voucherNo: "asc", sourceAccount: "asc", amount: "desc" };

export default function ReclassReviewView({ items, canWrite, statusFilter, onReview, companyCode = "", year = "" }: Props) {
  const [adjustItem, setAdjustItem] = useState<ReclassResultRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const list = items.filter((r) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "unconfigured") return r.kind === "normal";
      if (statusFilter === "configured") return r.kind === "approved";
      if (statusFilter === "adjusted") return r.kind === "adjusted";
      // legacy: pending → treat as unconfigured; confirmed → treat as configured
      if (statusFilter === "pending") return r.kind === "pending";
      if (statusFilter === "confirmed") return r.kind !== "pending";
      return true;
    });
    const cmp = sortDir === "asc" ? 1 : -1;
    if (sortKey === "amount") list.sort((a, b) => ((a.itemDebit || a.itemCredit || 0) - (b.itemDebit || b.itemCredit || 0)) * cmp);
    else if (sortKey === "voucherNo") list.sort((a, b) => a.voucherNo.localeCompare(b.voucherNo) * cmp);
    else list.sort((a, b) => a.sourceAccount.localeCompare(b.sourceAccount) * cmp);
    return list;
  }, [items, statusFilter, sortKey, sortDir]);

  function handleSort(label: string) {
    const key = SORT_LABELS[label];
    if (!key) return;
    setSortKey(key);
    setSortDir(sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : DEFAULT_DIR[key]);
  }
  const arrow = (label: string) => SORT_LABELS[label] === sortKey ? (sortDir === "asc" ? " ↑" : " ↓") : null;

  return (
    <div>
      <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              {REVIEW_HEADERS.map((h) => {
                const canSort = h in SORT_LABELS;
                return <th key={h} className={`whitespace-nowrap px-4 py-3 font-medium ${h === "金额" ? "text-right" : "text-left"} ${canSort ? "cursor-pointer select-none hover:text-slate-700" : ""}`} onClick={canSort ? () => handleSort(h) : undefined}>{h}<span className="text-slate-400">{arrow(h)}</span></th>;
              })}
              {canWrite && <th className="whitespace-nowrap px-4 py-3 text-center font-medium">操作</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {filtered.map((r) => {
              const kind = r.kind as string || "normal";
              const isNormal = kind === "normal";
              const isAdjusted = kind === "adjusted";
              const isAbnormal = !isNormal;
              const itemSide = r.itemDebit > 0 ? "debit" : r.itemCredit > 0 ? "credit" : null;
              const itemAmount = r.itemDebit || r.itemCredit || 0;
              const displayTarget = r.suggestedTarget || r.targetAccount;
              const hasTarget = !!displayTarget;
              return (
              <tr key={`${r.voucherItemId}-${r.voucherNo}`} className="hover:bg-emerald-50/20">
                <td className="px-4 py-3 font-mono text-slate-500">{r.voucherNo}</td>
                <td className="px-4 py-3 font-mono text-slate-600">{r.sourceAccount}</td>
                <td className="px-4 py-3 text-slate-800">{r.sourceAccountName}</td>
                <td className="px-4 py-3 text-center">
                  {itemSide ? isAbnormal
                    ? <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-red-50 text-red-700">{itemSide === "debit" ? "借" : "贷"}</span>
                    : <span className="text-gray-400">{itemSide === "debit" ? "借" : "贷"}</span>
                  : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">¥{fmt(itemAmount)}</td>
                <td className="px-4 py-3">
                  {isNormal && !hasTarget
                    ? <span className="inline-block rounded border border-dashed border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-400 cursor-pointer hover:border-emerald-300 hover:text-emerald-600" onClick={() => canWrite && setAdjustItem(r)}>选择科目</span>
                    : <span className={`inline-block rounded border px-2 py-0.5 text-xs font-mono cursor-pointer hover:ring-1 hover:ring-emerald-300 ${isNormal ? "border-gray-200 bg-gray-50 text-gray-500" : isAdjusted ? "border-blue-200 bg-blue-50 text-blue-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} onClick={() => canWrite && setAdjustItem(r)}>{targetDisplay(displayTarget)}</span>}
                </td>
                {canWrite && (
                  <td className="px-4 py-3 text-center">
                    {isNormal && !hasTarget ? (
                      <button onClick={() => setAdjustItem(r)} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100">设置</button>
                    ) : isNormal ? (
                      <button onClick={() => setAdjustItem(r)} className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">使用建议</button>
                    ) : (
                      <button onClick={() => setAdjustItem(r)} className="rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100">修改</button>
                    )}
                  </td>
                )}
              </tr>);
            })}
            {filtered.length === 0 && <tr><td colSpan={canWrite ? 7 : 6} className="px-4 py-8 text-center text-gray-400">无重分类条目</td></tr>}
          </tbody>
        </table>
      </PanelCard>
      <ReclassReviewModal item={adjustItem} open={!!adjustItem} companyCode={companyCode} year={year} onClose={() => setAdjustItem(null)}
        onSubmit={async (id, targetAccount, amount, note) => {
          const extra = id === 0 && adjustItem ? { periodId: adjustItem.periodId, voucherItemId: adjustItem.voucherItemId, sourceAccount: adjustItem.sourceAccount } : undefined;
          onReview(id, "adjust", { targetAccount, amount, note }, extra);
        }} />
    </div>
  );
}
