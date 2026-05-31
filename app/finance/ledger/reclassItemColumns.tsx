import type { DataTableColumn } from "@/app/components/DataTable";
import type { VoucherItemRow } from "../components/VoucherItemTable";
import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";

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

export function buildReclassItemColumns(
  reclassMap: Map<number, ReclassResultRow>,
  canWrite: boolean,
  onReview: (id: number, action: "approve" | "reject" | "adjust", body?: Record<string, unknown>) => void,
): DataTableColumn<VoucherItemRow>[] {
  return [
    {
      key: "reclassStatus", label: "重分类", defaultVisible: true,
      render: (row) => {
        const rr = reclassMap.get(row.id);
        return rr ? <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASS[rr.status] || ""}`}>{STATUS_LABEL[rr.status] || rr.status}</span> : <span className="text-gray-300">—</span>;
      },
    },
    {
      key: "reclassTarget", label: "目标科目", cellClassName: "font-mono text-gray-600",
      render: (row) => reclassMap.get(row.id)?.targetAccount || "—",
    },
    {
      key: "reclassAmount", label: "重分类金额", className: "text-right text-gray-700", headerClassName: "text-right",
      render: (row) => { const rr = reclassMap.get(row.id); return rr ? `¥${fmt(rr.amount)}` : "—"; },
    },
    {
      key: "reclassActions", label: "操作",
      render: (row) => {
        if (!canWrite) return null;
        const rr = reclassMap.get(row.id);
        if (!rr || rr.status !== "pending") return null;
        return (
          <div className="flex items-center gap-1">
            <button onClick={() => onReview(rr.id, "approve")} className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">通过</button>
            <button onClick={() => onReview(rr.id, "reject")} className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-100">驳回</button>
            <button onClick={() => {
              const t = prompt("调整目标科目:", rr.targetAccount);
              if (!t) return;
              const a = prompt("调整金额:", String(rr.amount));
              if (!a) return;
              onReview(rr.id, "adjust", { targetAccount: t, amount: parseFloat(a) });
            }} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-100">调整</button>
          </div>
        );
      },
    },
  ];
}
