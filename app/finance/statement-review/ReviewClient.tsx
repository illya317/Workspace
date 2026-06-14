"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import ReviewFilters from "./ReviewFilters";
import ReviewAlerts from "./ReviewAlerts";
import ReviewToolbar from "./ReviewToolbar";
import ReviewTable from "./ReviewTable";
import type { RvLine } from "./types";
import type { LineState } from "./ReviewTable";

interface WpLine { id: number; lineCode: string; manualAmount: number; importedAmount: number; }
interface Workpaper { id: number; lines: WpLine[]; }
interface Review { id: number; status: string; isStale: boolean; lines: RvLine[]; }
type Edits = Map<string, { adjustedAmount: number | null; status: string; comment: string | null }>;

const RT_SET: Set<string> = new Set(["incomeStatement", "cashFlow"]);

export default function ReviewClient() {
  const searchParams = useSearchParams();
  const rtFromQuery = searchParams.get("reportType");
  const [co, setCo] = useState(searchParams.get("companyCode") || "02");
  const [yr, setYr] = useState(searchParams.get("year") || "2025");
  const [mo, setMo] = useState(searchParams.get("month") || "6");
  const [rt, setRt] = useState(rtFromQuery && RT_SET.has(rtFromQuery) ? rtFromQuery : "incomeStatement");
  const [wp, setWp] = useState<Workpaper | null>(null); const [rv, setRv] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingAmt, setEditingAmt] = useState<string | null>(null); const [editAmt, setEditAmt] = useState("");
  const [editingCmt, setEditingCmt] = useState<string | null>(null); const [editCmt, setEditCmt] = useState("");
  const [edits, setEdits] = useState<Edits>(new Map());
  const clear = () => { setWp(null); setRv(null); setEdits(new Map()); setError(null); };

  const loadWp = useCallback(async () => {
    setLoading(true); setError(null); clear();
    const r = await fetch(`/workspace/api/finance/statement-workpapers?companyCode=${co}&year=${yr}&month=${mo}&reportType=${rt}`);
    if (!r.ok) { setError(`加载底稿失败 (${r.status})`); setLoading(false); return; }
    const d = await r.json(); setWp(d.id ? d : { ...d, id: 0 });
    if (d.id) { const rr = await fetch(`/workspace/api/finance/statement-reviews?workpaperId=${d.id}`); if (rr.ok) { const rd = await rr.json(); if (rd.review) setRv(rd.review); } }
    setLoading(false);
  }, [co, yr, mo, rt]);

  const generate = async () => {
    if (!wp || !wp.id) return;
    setLoading(true); setError(null);
    const r = await fetch("/workspace/api/finance/statement-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workpaperId: wp.id }) });
    const d = await r.json(); if (!r.ok) { setError(d.error || "生成校对失败"); setLoading(false); return; }
    setRv(d.review); setEdits(new Map()); setLoading(false);
  };

  const saveEdits = async () => {
    if (!rv || edits.size === 0) return;
    setSaving(true); setError(null);
    const lines = [...edits.entries()].map(([lineCode, e]) => ({ lineCode, ...e }));
    const r = await fetch(`/workspace/api/finance/statement-reviews/${rv.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }) });
    const d = await r.json(); if (!r.ok) { setError(d.error || "保存失败"); setSaving(false); return; }
    setRv(d.review); setEdits(new Map()); setSaving(false);
  };

  const doConfirm = async () => {
    if (!rv) return;
    setSaving(true); setError(null);
    const r = await fetch(`/workspace/api/finance/statement-reviews/${rv.id}/confirm`, { method: "POST" });
    const d = await r.json(); if (!r.ok) { setError(d.error || "确认失败"); setSaving(false); return; }
    setRv(d.review); setSaving(false);
  };

  // ─── edit helpers ───────────────────────────────────────────

  function upsertEdit(line: RvLine, patch: Partial<{ adjustedAmount: number | null; status: string; comment: string | null }>) {
    setEdits((p) => {
      const n = new Map(p);
      const cur = getLineState(line);
      const base = n.get(line.lineCode) || { adjustedAmount: cur.adjustedAmount, status: cur.status, comment: cur.comment };
      if (patch.adjustedAmount !== undefined) base.adjustedAmount = patch.adjustedAmount;
      if (patch.status !== undefined) base.status = patch.status;
      if (patch.comment !== undefined) base.comment = patch.comment;
      n.set(line.lineCode, base);
      return n;
    });
  }

  const commitAmt = (line: RvLine) => {
    const val = editAmt.trim();
    const adj: number | null = val === "" ? null : parseFloat(val);
    if (val !== "" && (isNaN(adj!) || !Number.isFinite(adj!))) { setEditingAmt(null); return; }
    const cur = getLineState(line);
    const status = adj != null ? "adjusted" : (cur.status === "adjusted" ? "confirmed" : undefined);
    upsertEdit(line, { adjustedAmount: adj, ...(status !== undefined ? { status } : {}) });
    setEditingAmt(null);
  };
  const commitCmt = (line: RvLine) => { upsertEdit(line, { comment: editCmt.trim() || null }); setEditingCmt(null); };
  const toggleStatus = (line: RvLine) => {
    if (rv?.status === "confirmed") return;
    const cur = getLineState(line).status;
    const next = cur === "pending" ? "confirmed" : cur === "confirmed" ? "flagged" : "pending";
    upsertEdit(line, { status: next });
  };

  function getLineState(l: RvLine): LineState {
    const e = edits.get(l.lineCode);
    return {
      adjustedAmount: e ? e.adjustedAmount : l.adjustedAmount,
      status: e ? e.status : l.status,
      comment: e ? e.comment : l.comment,
      finalAmount: e && e.adjustedAmount != null ? e.adjustedAmount : (e && e.adjustedAmount === null ? l.workpaperAmount : l.finalAmount),
    };
  }

  const isReadOnly = rv?.status === "confirmed";
  const changedCount = edits.size;
  const hasFlaggedWithoutComment = rv ? rv.lines.some(l => {
    const s = getLineState(l);
    return s.status === "flagged" && !s.comment;
  }) : false;

  // ─── render ─────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <ReviewFilters co={co} yr={yr} mo={mo} rt={rt} setCo={setCo} setYr={setYr} setMo={setMo} setRt={setRt} loading={loading} onLoad={loadWp} />

      <ReviewAlerts error={error} isStale={rv?.isStale} hasFlaggedWithoutComment={hasFlaggedWithoutComment} />

      <ReviewToolbar wp={wp} rv={rv} changedCount={changedCount} saving={saving} loading={loading}
        isReadOnly={isReadOnly} co={co} yr={yr} mo={mo} rt={rt}
        onGenerate={generate} onSave={saveEdits} onConfirm={doConfirm} />

      {rv && <ReviewTable rv={rv} getLineState={getLineState} isReadOnly={isReadOnly}
        editingAmt={editingAmt} setEditingAmt={setEditingAmt} editAmt={editAmt} setEditAmt={setEditAmt} commitAmt={commitAmt}
        editingCmt={editingCmt} setEditingCmt={setEditingCmt} editCmt={editCmt} setEditCmt={setEditCmt} commitCmt={commitCmt}
        toggleStatus={toggleStatus} />}

      {!wp && !loading && <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-400">选择筛选条件后点击「读取底稿」</div>}
      {loading && <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-400">加载中...</div>}
    </div>
  );
}
