"use client";

import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";

interface VoucherItem {
  id: number;
  account?: { code: string; name: string } | null;
  debit: number;
  credit: number;
  description: string | null;
  relatedEntity?: string | null;
}

interface Props {
  items: VoucherItem[];
  visibleColumns?: string[];
  /** Batch 5: 按 voucherItemId 索引的 reclass 结果 */
  reclassMap?: Map<number, ReclassResultRow>;
  canWrite?: boolean;
  onReview?: (id: number, action: "approve" | "reject" | "adjust", body?: Record<string, unknown>) => void;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  pending: "待审核", approved: "已通过", adjusted: "已调整", rejected: "已驳回",
};
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  approved: "bg-emerald-50 text-emerald-700",
  adjusted: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-red-700",
};

export default function VoucherItemTable({ items, visibleColumns, reclassMap, canWrite, onReview }: Props) {
  const show = (key: string) => !visibleColumns || visibleColumns.includes(key);
  const hasReclass = !!reclassMap;

  return (
    <table className="w-full text-xs">
      <thead className="border-b bg-gray-100">
        <tr>
          {show("seq") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">序号</th>}
          {show("accountCode") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">科目编码</th>}
          {show("accountName") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">科目名称</th>}
          {show("description") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">摘要</th>}
          {show("debit") && <th className="px-3 py-1.5 text-right font-medium text-gray-500">借方</th>}
          {show("credit") && <th className="px-3 py-1.5 text-right font-medium text-gray-500">贷方</th>}
          {show("relatedEntity") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">关联实体</th>}
          {hasReclass && show("reclassStatus") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">重分类</th>}
          {hasReclass && show("reclassTarget") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">目标科目</th>}
          {hasReclass && show("reclassAmount") && <th className="px-3 py-1.5 text-right font-medium text-gray-500">重分类金额</th>}
          {hasReclass && canWrite && show("reclassActions") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">操作</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => {
          const rr = reclassMap?.get(item.id);
          return (
          <tr key={item.id} className="border-b last:border-0">
            {show("seq") && <td className="px-3 py-1.5 text-gray-500">{idx + 1}</td>}
            {show("accountCode") && <td className="px-3 py-1.5 font-mono text-gray-600">{item.account?.code || "-"}</td>}
            {show("accountName") && <td className="px-3 py-1.5 text-gray-700">{item.account?.name || "-"}</td>}
            {show("description") && <td className="px-3 py-1.5 text-gray-600">{item.description || "-"}</td>}
            {show("debit") && <td className="px-3 py-1.5 text-right text-gray-700">{item.debit > 0 ? fmt(item.debit) : ""}</td>}
            {show("credit") && <td className="px-3 py-1.5 text-right text-gray-700">{item.credit > 0 ? fmt(item.credit) : ""}</td>}
            {show("relatedEntity") && <td className="px-3 py-1.5 text-gray-500">{item.relatedEntity || "-"}</td>}
            {hasReclass && show("reclassStatus") && (
              <td className="px-3 py-1.5">
                {rr ? (
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASS[rr.status] || ""}`}>
                    {STATUS_LABEL[rr.status] || rr.status}
                  </span>
                ) : <span className="text-gray-300">—</span>}
              </td>
            )}
            {hasReclass && show("reclassTarget") && (
              <td className="px-3 py-1.5 font-mono text-gray-600">{rr?.targetAccount || "—"}</td>
            )}
            {hasReclass && show("reclassAmount") && (
              <td className="px-3 py-1.5 text-right font-mono text-gray-700">{rr ? `¥${fmt(rr.amount)}` : "—"}</td>
            )}
            {hasReclass && canWrite && show("reclassActions") && (
              <td className="px-3 py-1.5">
                {rr && rr.status === "pending" && onReview ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => onReview(rr.id, "approve")} className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">通过</button>
                    <button onClick={() => onReview(rr.id, "reject")} className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-100">驳回</button>
                    <button onClick={() => {
                      const target = prompt("调整目标科目:", rr.targetAccount);
                      if (!target) return;
                      const amount = prompt("调整金额:", String(rr.amount));
                      if (!amount) return;
                      onReview(rr.id, "adjust", { targetAccount: target, amount: parseFloat(amount) });
                    }} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-100">调整</button>
                  </div>
                ) : null}
              </td>
            )}
          </tr>
        );})}
      </tbody>
    </table>
  );
}
