"use client";

import { useState, useMemo } from "react";
import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";
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

const SORT_LABELS: Record<string, SortKey> = {
  "凭证号": "voucherNo",
  "科目编码": "sourceAccount",
  "金额": "amount",
};

const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  voucherNo: "asc",
  sourceAccount: "asc",
  amount: "desc",
};

export default function ReclassReviewView({ items, canWrite, statusFilter, onReview, companyCode = "", year = "" }: Props) {
  const [adjustItem, setAdjustItem] = useState<ReclassResultRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const list = items.filter((r) =>
      statusFilter === "all" ||
      (statusFilter === "confirmed" && r.status !== "pending") ||
      r.status === statusFilter
    );
    const cmp = sortDir === "asc" ? 1 : -1;
    if (sortKey === "amount") {
      list.sort((a, b) => ((a.itemDebit || a.itemCredit || 0) - (b.itemDebit || b.itemCredit || 0)) * cmp);
    } else if (sortKey === "voucherNo") {
      list.sort((a, b) => a.voucherNo.localeCompare(b.voucherNo) * cmp);
    } else {
      list.sort((a, b) => a.sourceAccount.localeCompare(b.sourceAccount) * cmp);
    }
    return list;
  }, [items, statusFilter, sortKey, sortDir]);

  function handleSort(label: string) {
    const key = SORT_LABELS[label];
    if (!key) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  }

  const arrow = (label: string) => {
    if (SORT_LABELS[label] !== sortKey) return null;
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b bg-gray-100">
            <tr>
              {REVIEW_HEADERS.map((h) => {
                const canSort = h in SORT_LABELS;
                return (
                  <th key={h}
                    className={`px-3 py-1.5 font-medium text-gray-500 ${h === "金额" ? "text-right" : "text-left"} ${canSort ? "cursor-pointer select-none hover:text-gray-700" : ""}`}
                    onClick={canSort ? () => handleSort(h) : undefined}>
                    {h}<span className="text-gray-400">{arrow(h)}</span>
                  </th>
                );
              })}
              {canWrite && <th className="px-3 py-1.5 text-center font-medium text-gray-500">操作</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isAbnormal = !!r.abnormalSide;
              const itemSide = r.itemDebit > 0 ? "debit" : r.itemCredit > 0 ? "credit" : null;
              const itemAmount = r.itemDebit || r.itemCredit || 0;
              const isPending = r.status === "pending";
              const hasTarget = !!r.targetAccount;
              return (
              <tr key={`${r.voucherItemId || r.id}-${r.voucherNo}`} className="border-b last:border-0">
                <td className="px-3 py-1.5 font-mono text-gray-500">{r.voucherNo}</td>
                <td className="px-3 py-1.5 font-mono text-gray-600">{r.sourceAccount}</td>
                <td className="px-3 py-1.5 text-gray-700">{r.sourceAccountName}</td>
                <td className="px-3 py-1.5 text-center">
                  {itemSide && isAbnormal
                    ? <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-red-50 text-red-700">{itemSide === "debit" ? "借" : "贷"}</span>
                    : itemSide
                    ? <span className="text-gray-400">{itemSide === "debit" ? "借" : "贷"}</span>
                    : <span className="text-gray-300">—</span>
                  }
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-gray-700">¥{fmt(itemAmount)}</td>
                <td className="px-3 py-1.5">
                  {hasTarget ? (
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-xs font-mono cursor-pointer hover:ring-1 hover:ring-emerald-300 ${
                        isPending
                          ? "border-gray-200 bg-gray-50 text-gray-500"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                      onClick={() => setAdjustItem(r)}>
                      {targetDisplay(r.targetAccount)}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                {canWrite && (
                  <td className="px-3 py-1.5 text-center">
                    {isPending ? (
                      <button onClick={() => onReview(r.id, "approve")} className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">确认</button>
                    ) : (
                      <button onClick={() => {
                        if (r.id === 0) {
                          onReview(0, "mark_pending", { targetAccount: r.targetAccount }, { periodId: r.periodId, voucherItemId: r.voucherItemId, sourceAccount: r.sourceAccount });
                        } else {
                          onReview(r.id, "mark_pending");
                        }
                      }} className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100">待审核</button>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
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
        onSubmit={async (id, targetAccount, amount, note) => {
          const extra = id === 0 && adjustItem
            ? { periodId: adjustItem.periodId, voucherItemId: adjustItem.voucherItemId, sourceAccount: adjustItem.sourceAccount }
            : undefined;
          onReview(id, "adjust", { targetAccount, amount, note }, extra);
        }} />
    </div>
  );
}
