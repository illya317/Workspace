"use client";

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
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-xs">
        <thead className="border-b-2 border-gray-300 bg-gray-200">
          <tr className="text-gray-800">
            <th className="px-2 py-2 text-left font-semibold">项目</th>
            <th className="px-2 py-2 text-right font-semibold w-28">系统建议</th>
            <th className="px-2 py-2 text-right font-semibold w-28">底稿输入</th>
            <th className="px-2 py-2 text-right font-semibold w-28">调整金额</th>
            <th className="px-2 py-2 text-right font-semibold w-28">最终金额</th>
            <th className="px-2 py-2 text-center font-semibold w-20">状态</th>
            <th className="px-2 py-2 text-left font-semibold w-40">备注</th>
          </tr>
        </thead>
        <tbody>
          {rv.lines.map((l) => {
            const s = getLineState(l);
            const amtEdit = editingAmt === l.lineCode, cmtEdit = editingCmt === l.lineCode;
            return (
              <tr key={l.lineCode} className={`border-b ${s.status === "flagged" ? "bg-red-50/50" : s.status === "pending" ? "bg-yellow-50/30" : ""}`}>
                <td className="px-2 py-1.5 font-medium text-gray-700">{l.label}</td>
                <td className="px-2 py-1.5 text-right text-gray-400">{FMT(l.systemAmount)}</td>
                <td className="px-2 py-1.5 text-right text-gray-600">{FMT(l.workpaperAmount)}</td>
                <td className="px-2 py-1.5 text-right">
                  {amtEdit ? (
                    <input autoFocus value={editAmt} onChange={(e) => setEditAmt(e.target.value)}
                      onBlur={() => commitAmt(l)} onKeyDown={(e) => { if (e.key === "Enter") commitAmt(l); if (e.key === "Escape") setEditingAmt(null); }}
                      className="w-full rounded border border-emerald-300 px-1 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                  ) : (
                    <button onClick={() => { if (!isReadOnly) { setEditingAmt(l.lineCode); setEditAmt(s.adjustedAmount != null ? String(s.adjustedAmount) : ""); } }}
                      className={`${!isReadOnly ? "cursor-pointer hover:bg-gray-100" : ""} rounded px-1 py-0.5 ${s.adjustedAmount != null ? "font-medium text-blue-600" : "text-gray-300"}`}>
                      {s.adjustedAmount != null ? FMT(s.adjustedAmount) : "—"}
                    </button>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right font-medium text-gray-800">{FMT(s.finalAmount)}</td>
                <td className="px-2 py-1.5 text-center">
                  <button onClick={() => toggleStatus(l)} disabled={isReadOnly}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${isReadOnly ? "" : "hover:opacity-80"} ${s.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : s.status === "adjusted" ? "bg-blue-50 text-blue-700" : s.status === "flagged" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                    {STS[s.status] || s.status}
                  </button>
                </td>
                <td className="px-2 py-1.5 text-[11px]">
                  {cmtEdit ? (
                    <input autoFocus value={editCmt} onChange={(e) => setEditCmt(e.target.value)}
                      onBlur={() => commitCmt(l)} onKeyDown={(e) => { if (e.key === "Enter") commitCmt(l); if (e.key === "Escape") setEditingCmt(null); }}
                      className="w-full rounded border border-emerald-300 px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-400" />
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
    </div>
  );
}
