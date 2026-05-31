"use client";

import { useEffect, useState, useRef } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import type { RuleCandidate } from "@/server/services/finance/ledger/reclass-rules";

interface Props { companyCode: string; year: string; canWrite: boolean; }

export default function ReclassCandidateList({ companyCode, year, canWrite }: Props) {
  const [candidates, setCandidates] = useState<RuleCandidate[]>([]);
  const [statsText, setStatsText] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast, showToast, closeToast } = useToast();
  const [editCode, setEditCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ───────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/reclass-rules?companyCode=${companyCode}&year=${year}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
        const s = data.stats;
        if (s) setStatsText(`${s.totalAccountsScanned} 个科目，${s.abnormalCount} 异常，${s.withExistingRule} 已有规则`);
      } else { showToast("加载失败", "error"); }
    } catch { showToast("网络错误", "error"); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyCode, year]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────

  async function saveRule(c: RuleCandidate, target: string) {
    const res = await fetch("/api/finance/reclass-rules", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyCode, year: parseInt(year), sourceAccountCode: c.accountCode, abnormalSide: c.abnormalSide, targetAccountCode: target }),
    });
    if (!res.ok) { showToast("保存失败", "error"); return false; }
    const data = await res.json();
    setCandidates((prev) => prev.map((r) =>
      r.accountCode === c.accountCode && r.abnormalSide === c.abnormalSide
        ? { ...r, existingRuleId: data.rule.id, existingTarget: data.rule.targetAccountCode, existingSource: data.rule.source, existingEnabled: data.rule.enabled }
        : r));
    return true;
  }

  async function clearRule(c: RuleCandidate) {
    if (!c.existingRuleId) return;
    if (!(await fetch(`/api/finance/reclass-rules/${c.existingRuleId}`, { method: "DELETE" })).ok) { showToast("清除失败", "error"); return; }
    setCandidates((prev) => prev.map((r) =>
      r.accountCode === c.accountCode && r.abnormalSide === c.abnormalSide
        ? { ...r, existingRuleId: null, existingTarget: null, existingSource: null, existingEnabled: null }
        : r));
    showToast("已清除规则");
  }

  function startEdit(c: RuleCandidate) {
    setEditCode(c.accountCode + "::" + c.abnormalSide);
    setEditValue(c.existingTarget || c.suggestedTarget);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commitEdit(c: RuleCandidate) {
    const val = editValue.trim();
    setEditCode(null); setEditValue("");
    if (val && val !== (c.existingTarget || "")) { if (await saveRule(c, val)) showToast("已更新规则"); }
  }

  // ── Render helpers ───────────────────────────────────

  const dirBadge = (dir: string) =>
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${dir === "debit" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
      {dir === "debit" ? "借" : "贷"}</span>;

  // ── Render ───────────────────────────────────────────

  if (loading) return <p className="py-8 text-center text-sm text-gray-400">扫描中...</p>;
  if (candidates.length === 0) return <p className="py-8 text-center text-sm text-gray-400">该年度无异常方向科目（仅扫描资产/负债类 1xxx、2xxx 科目）</p>;

  return (
    <div>
      {statsText && <p className="mb-3 text-xs text-gray-500">{statsText}</p>}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              {["科目编码", "科目名称", "常规方向", "异常方向", "异常金额", "建议目标", "当前目标"].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500">{h}</th>)}
              {canWrite && <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">操作</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {candidates.map((c) => {
              const key = c.accountCode + "::" + c.abnormalSide;
              const editing = editCode === key;
              const hasRule = !!c.existingRuleId;
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{c.accountCode}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">{c.accountName}</td>
                  <td className="px-3 py-2">{dirBadge(c.balanceDirection)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">{c.abnormalSide === "debit" ? "借" : "贷"}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">¥{c.abnormalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-400">{c.suggestedTarget || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {editing ? (
                      <input ref={inputRef} type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(c)} onKeyDown={(e) => { if (e.key === "Escape") { setEditCode(null); setEditValue(""); } if (e.key === "Enter") commitEdit(c); }}
                        className="w-24 rounded border border-emerald-400 px-2 py-0.5 text-xs focus:outline-none" />
                    ) : hasRule ? <span className="text-emerald-700">{c.existingTarget}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {!hasRule && c.suggestedTarget && (
                          <button onClick={() => saveRule(c, c.suggestedTarget).then(ok => ok && showToast("已确认规则"))} className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">确认建议</button>
                        )}
                        <button onClick={() => startEdit(c)} className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100">
                          {hasRule ? "编辑" : "手动配置"}</button>
                        {hasRule && <button onClick={() => clearRule(c)} className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50">清除</button>}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
