"use client";

import { PanelCard } from "@workspace/core/ui";
import type { RvLine } from "./types";

const FMT = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STS: Record<string, string> = { pending: "待确认", confirmed: "✓已确认", adjusted: "⚡已调整", flagged: "⚠已标记" };

export interface LineState {
  adjustedAmount: number | null;
  status: string;
  comment: string | null;
  finalAmount: number;
}

interface Props {
  rv: { id: number; status: string; isStale: boolean; lines: RvLine[] };
  getLineState: (l: RvLine) => LineState;
  isReadOnly: boolean;
  editingAmt: string | null; setEditingAmt: (v: string | null) => void;
  editAmt: string; setEditAmt: (v: string) => void;
  commitAmt: (l: RvLine) => void;
  editingCmt: string | null; setEditingCmt: (v: string | null) => void;
  editCmt: string; setEditCmt: (v: string) => void;
  commitCmt: (l: RvLine) => void;
  toggleStatus: (l: RvLine) => void;
}

export default function ReviewTable({ rv, getLineState, isReadOnly, editingAmt, setEditingAmt, editAmt, setEditAmt, commitAmt, editingCmt, setEditingCmt, editCmt, setEditCmt, commitCmt, toggleStatus }: Props) {
  return (
    <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 font-medium">项目</th>
            <th className="whitespace-nowrap w-28 px-4 py-3 text-right font-medium">系统建议</th>
            <th className="whitespace-nowrap w-28 px-4 py-3 text-right font-medium">底稿输入</th>
            <th className="whitespace-nowrap w-28 px-4 py-3 text-right font-medium">调整金额</th>
            <th className="whitespace-nowrap w-28 px-4 py-3 text-right font-medium">最终金额</th>
            <th className="whitespace-nowrap w-20 px-4 py-3 text-center font-medium">状态</th>
            <th className="whitespace-nowrap w-40 px-4 py-3 font-medium">备注</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {rv.lines.map((l) => {
            const s = getLineState(l);
            const amtEdit = editingAmt === l.lineCode, cmtEdit = editingCmt === l.lineCode;
            return (
              <tr key={l.lineCode} className={`${s.status === "flagged" ? "bg-red-50/50" : s.status === "pending" ? "bg-amber-50/30" : "hover:bg-emerald-50/20"}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{l.label}</td>
                <td className="px-4 py-3 text-right text-slate-400">{FMT(l.systemAmount)}</td>
                <td className="px-4 py-3 text-right text-slate-600">{FMT(l.workpaperAmount)}</td>
                <td className="px-4 py-3 text-right">
                  {amtEdit ? (
                    <input autoFocus value={editAmt} onChange={(e) => setEditAmt(e.target.value)}
                      onBlur={() => commitAmt(l)} onKeyDown={(e) => { if (e.key === "Enter") commitAmt(l); if (e.key === "Escape") setEditingAmt(null); }}
                      className="w-full rounded border border-emerald-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                  ) : (
                    <button onClick={() => { if (!isReadOnly) { setEditingAmt(l.lineCode); setEditAmt(s.adjustedAmount != null ? String(s.adjustedAmount) : ""); } }}
                      className={`${!isReadOnly ? "cursor-pointer hover:bg-gray-100" : ""} rounded px-1 py-0.5 ${s.adjustedAmount != null ? "font-medium text-blue-600" : "text-gray-300"}`}>
                      {s.adjustedAmount != null ? FMT(s.adjustedAmount) : "—"}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-800">{FMT(s.finalAmount)}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleStatus(l)} disabled={isReadOnly}
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${isReadOnly ? "" : "hover:opacity-80"} ${s.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : s.status === "adjusted" ? "bg-blue-50 text-blue-700" : s.status === "flagged" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                    {STS[s.status] || s.status}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm">
                  {cmtEdit ? (
                    <input autoFocus value={editCmt} onChange={(e) => setEditCmt(e.target.value)}
                      onBlur={() => commitCmt(l)} onKeyDown={(e) => { if (e.key === "Enter") commitCmt(l); if (e.key === "Escape") setEditingCmt(null); }}
                      className="w-full rounded border border-emerald-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                  ) : (
                    <button onClick={() => { if (!isReadOnly) { setEditingCmt(l.lineCode); setEditCmt(s.comment || ""); } }}
                      className={`${!isReadOnly ? "cursor-pointer hover:bg-gray-100" : ""} rounded px-1 py-0.5 w-full text-left ${s.comment ? "text-gray-600" : s.status === "flagged" ? "text-red-400 italic" : "text-gray-300"}`}>
                      {s.comment || (s.status === "flagged" ? "请填写标记原因…" : "—")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PanelCard>
  );
}
