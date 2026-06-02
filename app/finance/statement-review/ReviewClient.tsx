"use client";

import { useState, useEffect, useCallback } from "react";
import SelectField from "@/app/components/SelectField";

// ─── types ───────────────────────────────────────────────────

interface WpLine { id: number; lineCode: string; manualAmount: number; importedAmount: number; }
interface Workpaper { id: number; lines: WpLine[]; }
interface RvLine { id: number; lineCode: string; label: string; sortOrder: number; systemAmount: number; workpaperAmount: number; adjustedAmount: number | null; finalAmount: number; status: string; comment: string | null; }
interface Review { id: number; status: string; isStale: boolean; lines: RvLine[]; }

type Edits = Map<string, { adjustedAmount: number | null; status: string; comment: string | null }>;

const COS = [{ v: "01", l: "丰华生物" }, { v: "02", l: "天力通" }, { v: "03", l: "悦通" }, { v: "04", l: "制药" }, { v: "05", l: "加拿大" }, { v: "06", l: "上海悦通" }];
const YS = ["2024", "2025", "2026"];
const MS = Array.from({ length: 12 }, (_, i) => ({ v: String(i + 1), l: `${i + 1}月` }));
const RTS = [{ v: "incomeStatement", l: "利润表" }, { v: "cashFlow", l: "现金流量表" }];
const FMT = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STS: Record<string, string> = { pending: "待确认", confirmed: "✓已确认", adjusted: "⚡已调整", flagged: "⚠已标记" };

export default function ReviewClient() {
  const [co, setCo] = useState("02"); const [yr, setYr] = useState("2025"); const [mo, setMo] = useState("6"); const [rt, setRt] = useState("incomeStatement");
  const [wp, setWp] = useState<Workpaper | null>(null); const [rv, setRv] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // lineCode currently inline-editing
  const [editVal, setEditVal] = useState(""); // temp value during edit
  const [edits, setEdits] = useState<Edits>(new Map());

  const clear = () => { setWp(null); setRv(null); setEdits(new Map()); setError(null); };

  // ─── actions ───────────────────────────────────────────────

  const loadWp = useCallback(async () => {
    setLoading(true); setError(null); clear();
    const r = await fetch(`/api/finance/statement-workpapers?companyCode=${co}&year=${yr}&month=${mo}&reportType=${rt}`);
    if (!r.ok) { setError(`加载底稿失败 (${r.status})`); setLoading(false); return; }
    const d = await r.json();
    setWp(d.id ? d : { ...d, id: 0 }); // id=0 means draft
    if (d.id) {
      const rr = await fetch(`/api/finance/statement-reviews?workpaperId=${d.id}`);
      if (rr.ok) { const rd = await rr.json(); if (rd.review) setRv(rd.review); }
    }
    setLoading(false);
  }, [co, yr, mo, rt]);

  const generate = async () => {
    if (!wp || !wp.id) return;
    setLoading(true); setError(null);
    const r = await fetch("/api/finance/statement-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workpaperId: wp.id }) });
    const d = await r.json();
    if (!r.ok) { setError(d.error || "生成校对失败"); setLoading(false); return; }
    setRv(d.review); setEdits(new Map()); setLoading(false);
  };

  const saveEdits = async () => {
    if (!rv || edits.size === 0) return;
    setSaving(true); setError(null);
    const lines = [...edits.entries()].map(([lineCode, e]) => ({ lineCode, ...e }));
    const r = await fetch(`/api/finance/statement-reviews/${rv.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }) });
    const d = await r.json();
    if (!r.ok) { setError(d.error || "保存失败"); setSaving(false); return; }
    setRv(d.review); setEdits(new Map()); setSaving(false);
  };

  const confirm = async () => {
    if (!rv) return;
    setSaving(true); setError(null);
    const r = await fetch(`/api/finance/statement-reviews/${rv.id}/confirm`, { method: "POST" });
    const d = await r.json();
    if (!r.ok) { setError(d.error || "确认失败"); setSaving(false); return; }
    setRv(d.review); setSaving(false);
  };

  // ─── inline edit ───────────────────────────────────────────

  const startEdit = (lineCode: string, cur: number | null) => {
    setEditing(lineCode); setEditVal(cur != null ? String(cur) : "");
  };
  const commitEdit = (lineCode: string) => {
    const val = editVal.trim();
    const adj: number | null = val === "" ? null : parseFloat(val);
    if (val !== "" && (isNaN(adj!) || !Number.isFinite(adj!))) { setEditing(null); return; }
    setEdits((p) => {
      const n = new Map(p);
      const e = n.get(lineCode) || { adjustedAmount: null, status: "pending", comment: null };
      e.adjustedAmount = adj;
      e.status = adj != null ? "adjusted" : "confirmed";
      n.set(lineCode, e);
      return n;
    });
    setEditing(null);
  };
  const toggleStatus = (lineCode: string, cur: string) => {
    if (rv?.status === "confirmed") return;
    const next = cur === "flagged" ? "pending" : cur === "adjusted" ? "confirmed" : cur === "confirmed" ? "flagged" : "adjusted";
    setEdits((p) => { const n = new Map(p); const e = n.get(lineCode) || { adjustedAmount: null, status: cur, comment: null }; e.status = next; n.set(lineCode, e); return n; });
  };

  const getLineState = (l: RvLine) => {
    const e = edits.get(l.lineCode);
    return {
      adjustedAmount: e ? e.adjustedAmount : l.adjustedAmount,
      status: e ? e.status : l.status,
      comment: e ? e.comment : l.comment,
      finalAmount: e && e.adjustedAmount != null ? e.adjustedAmount : (e && e.adjustedAmount === null ? l.workpaperAmount : l.finalAmount),
    };
  };

  const isReadOnly = rv?.status === "confirmed";
  const changedCount = edits.size;

  // ─── render ────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <SelectField label="公司" options={COS.map(c => ({ value: c.v, label: c.l }))} value={co} onChange={setCo} placeholder="—" />
        <SelectField label="年度" options={YS.map(y => ({ value: y, label: y }))} value={yr} onChange={setYr} placeholder="—" />
        <SelectField label="月份" options={MS.map(m => ({ value: m.v, label: m.l }))} value={mo} onChange={setMo} placeholder="—" />
        <SelectField label="报表" options={RTS.map(r => ({ value: r.v, label: r.l }))} value={rt} onChange={setRt} placeholder="—" />
        <button onClick={loadWp} disabled={loading} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">读取底稿</button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {/* stale banner */}
      {rv?.isStale && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">⚠ 底稿已更新（version 高于生成校对时的快照），建议点击「生成校对」重新生成。</div>}

      {/* action bar */}
      {wp && (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <span className="text-xs text-gray-500">底稿已加载{!wp.id ? "（空草稿，请先在底稿页录入数据）" : ""}</span>
          {wp.id > 0 && !rv && <button onClick={generate} disabled={loading} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50">生成校对</button>}
          {rv && <span className="text-xs text-gray-500">校对状态：<b className={rv.status === "confirmed" ? "text-emerald-600" : "text-blue-600"}>{rv.status === "confirmed" ? "已确认" : "草稿"}</b></span>}
          {rv && changedCount > 0 && <button onClick={saveEdits} disabled={saving || isReadOnly} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">保存修改 ({changedCount})</button>}
          {rv && rv.status !== "confirmed" && <button onClick={confirm} disabled={saving || changedCount > 0} className="rounded bg-purple-600 px-3 py-1.5 text-xs text-white hover:bg-purple-700 disabled:opacity-50">确认校对</button>}
          {rv?.isStale && <button onClick={generate} disabled={loading} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50">重新生成</button>}
        </div>
      )}

      {/* review table */}
      {rv && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-100">
              <tr>
                <th className="px-2 py-2 text-left">项目</th>
                <th className="px-2 py-2 text-right w-28">系统建议</th>
                <th className="px-2 py-2 text-right w-28">底稿输入</th>
                <th className="px-2 py-2 text-right w-28">调整金额</th>
                <th className="px-2 py-2 text-right w-28">最终金额</th>
                <th className="px-2 py-2 text-center w-20">状态</th>
                <th className="px-2 py-2 text-left w-32">备注</th>
              </tr>
            </thead>
            <tbody>
              {rv.lines.map((l) => {
                const s = getLineState(l);
                const isEditing = editing === l.lineCode;
                return (
                  <tr key={l.lineCode} className={`border-b ${s.status === "flagged" ? "bg-red-50/50" : s.status === "pending" ? "bg-yellow-50/30" : ""}`}>
                    <td className="px-2 py-1.5 font-medium text-gray-700">{l.label}</td>
                    <td className="px-2 py-1.5 text-right text-gray-400">{FMT(l.systemAmount)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{FMT(l.workpaperAmount)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {isEditing ? (
                        <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                          onBlur={() => commitEdit(l.lineCode)} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(l.lineCode); if (e.key === "Escape") setEditing(null); }}
                          className="w-full rounded border border-emerald-300 px-1 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                      ) : (
                        <button onClick={() => { if (!isReadOnly) startEdit(l.lineCode, s.adjustedAmount); }}
                          className={`${!isReadOnly ? "cursor-pointer hover:bg-gray-100" : ""} rounded px-1 py-0.5 ${s.adjustedAmount != null ? "font-medium text-blue-600" : "text-gray-300"}`}>
                          {s.adjustedAmount != null ? FMT(s.adjustedAmount) : "—"}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium text-gray-800">{FMT(s.finalAmount)}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => toggleStatus(l.lineCode, s.status)} disabled={isReadOnly}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${isReadOnly ? "" : "hover:opacity-80"} ${s.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : s.status === "adjusted" ? "bg-blue-50 text-blue-700" : s.status === "flagged" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                        {STS[s.status] || s.status}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-gray-400 text-[11px]">{s.comment || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!wp && !loading && <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-400">选择筛选条件后点击「读取底稿」</div>}
      {loading && <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-400">加载中...</div>}
    </div>
  );
}
