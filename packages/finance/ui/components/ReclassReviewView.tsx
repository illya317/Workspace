"use client";

import { useState, useMemo } from "react";
import { createPageBody, PageSurface, createPageTableBlock, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { ReclassResultRow } from "@workspace/finance/server/ledger/reclass-results/types";
import ReclassReviewModal from "./ReclassReviewModal";
import { formatFinanceAmount } from "../formatters";
import { targetDisplay } from "../ledger/reclassColumns";
interface Props {
  items: ReclassResultRow[];
  canWrite: boolean;
  statusFilter: string;
  onReview: (id: number, action: "approve" | "revert" | "adjust" | "mark_pending", body?: Record<string, unknown>, extra?: {
    periodId?: number;
    voucherItemId?: number;
    sourceAccount?: string;
  }) => void;
  companyCode?: string;
  year?: string;
}
type SortKey = "voucherNo" | "sourceAccount" | "amount";
const SORT_LABELS: Record<string, SortKey> = {
  "凭证号": "voucherNo",
  "科目编码": "sourceAccount",
  "金额": "amount"
};
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  voucherNo: "asc",
  sourceAccount: "asc",
  amount: "desc"
};
export default function ReclassReviewView({
  items,
  canWrite,
  statusFilter,
  onReview,
  companyCode = "",
  year = ""
}: Props) {
  const [adjustItem, setAdjustItem] = useState<ReclassResultRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const filtered = useMemo(() => {
    const list = items.filter(r => {
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
    if (sortKey === "amount") list.sort((a, b) => ((a.itemDebit || a.itemCredit || 0) - (b.itemDebit || b.itemCredit || 0)) * cmp);else if (sortKey === "voucherNo") list.sort((a, b) => a.voucherNo.localeCompare(b.voucherNo) * cmp);else list.sort((a, b) => a.sourceAccount.localeCompare(b.sourceAccount) * cmp);
    return list;
  }, [items, statusFilter, sortKey, sortDir]);
  function handleSort(label: string) {
    const key = SORT_LABELS[label];
    if (!key) return;
    setSortKey(key);
    setSortDir(sortKey === key ? sortDir === "asc" ? "desc" : "asc" : DEFAULT_DIR[key]);
  }
  const arrow = (label: string) => SORT_LABELS[label] === sortKey ? sortDir === "asc" ? " ↑" : " ↓" : null;
  const columns: DataSurfaceColumnSpec<ReclassResultRow>[] = [{
    key: "voucherNo",
    label: `凭证号${arrow("凭证号") ?? ""}`,
    required: true,
    onHeaderClick: () => handleSort("凭证号"),

    font: "mono", tone: "muted",
    cell: row => row.voucherNo
  }, {
    key: "sourceAccount",
    label: `科目编码${arrow("科目编码") ?? ""}`,
    required: true,
    onHeaderClick: () => handleSort("科目编码"),

    font: "mono",
    cell: row => row.sourceAccount
  }, {
    key: "sourceAccountName",
    label: "科目名称",
    required: true,
    cell: row => row.sourceAccountName
  }, {
    key: "direction",
    label: "方向",
    required: true,
    align: "center",
    cell: row => {
      const kind = row.kind as string || "normal";
      const isAbnormal = kind !== "normal";
      const itemSide = row.itemDebit > 0 ? "debit" : row.itemCredit > 0 ? "credit" : null;
      if (!itemSide) return <span className="text-gray-300">-</span>;
      if (!isAbnormal) return <span className="text-gray-400">{itemSide === "debit" ? "借" : "贷"}</span>;
      return <span className="inline-block rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
            {itemSide === "debit" ? "借" : "贷"}
          </span>;
    }
  }, {
    key: "amount",
    label: `金额${arrow("金额") ?? ""}`,
    required: true,
    onHeaderClick: () => handleSort("金额"),
    align: "right",
     font: "mono",
    cell: row => `¥${formatFinanceAmount(row.itemDebit || row.itemCredit || 0)}`
  }, {
    key: "target",
    label: "目标科目",
    required: true,
    cell: row => {
      const kind = row.kind as string || "normal";
      const isNormal = kind === "normal";
      const isAdjusted = kind === "adjusted";
      const displayTarget = row.suggestedTarget || row.targetAccount;
      const hasTarget = !!displayTarget;
      const className = isNormal && !hasTarget ? "inline-block cursor-pointer rounded border border-dashed border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-400 hover:border-emerald-300 hover:text-emerald-600" : `inline-block cursor-pointer rounded border px-2 py-0.5 text-xs font-mono hover:ring-1 hover:ring-emerald-300 ${isNormal ? "border-gray-200 bg-gray-50 text-gray-500" : isAdjusted ? "border-blue-200 bg-blue-50 text-blue-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`;
      return <span className={className} onClick={() => canWrite && setAdjustItem(row)}>
            {hasTarget ? targetDisplay(displayTarget) : "选择科目"}
          </span>;
    }
  }];
  return <div>
      <PageSurface
        kind="list"
        embedded
        body={createPageBody([
          createPageTableBlock("reclass-review", {
            framed: true,


            rows: filtered,
            columns,
            visibleColumns: columns.map(column => column.key),
            emptyText: "无重分类条目",
            rowKey: row => `${row.voucherItemId}-${row.voucherNo}`,
            rowActions: canWrite ? (row) => {
              const kind = row.kind as string || "normal";
              const isNormal = kind === "normal";
              const hasTarget = !!(row.suggestedTarget || row.targetAccount);
              return [{ key: "adjust", kind: "edit", label: isNormal && !hasTarget ? "设置" : isNormal ? "使用建议" : "修改", onClick: () => setAdjustItem(row) }];
            } : undefined,
          }),
        ])}
      />
      <ReclassReviewModal item={adjustItem} open={!!adjustItem} companyCode={companyCode} year={year} onClose={() => setAdjustItem(null)} onSubmit={async (id, targetAccount, amount, note) => {
      const extra = id === 0 && adjustItem ? {
        periodId: adjustItem.periodId,
        voucherItemId: adjustItem.voucherItemId,
        sourceAccount: adjustItem.sourceAccount
      } : undefined;
      onReview(id, "adjust", {
        targetAccount,
        amount,
        note
      }, extra);
    }} />
    </div>;
}
