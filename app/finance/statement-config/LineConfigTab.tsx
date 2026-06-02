"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useStatementConfig } from "./StatementConfigContext";

interface LineCfg { lineCode: string; label: string; section: string; reclassSource: boolean; reclassTarget: boolean; isHeader: boolean; isTotal: boolean; isGrandTotal: boolean; }
interface Mapping { accountCode: string; lineCode: string; operator: "add" | "subtract"; source: string; }
interface AcctInfo { code: string; name: string; closingDebit: number; closingCredit: number; }
/** API response shapes — minimal fields consumed by this component. */
interface ApiLineCfg { lineCode: string; label: string; section: string; reclassSource?: boolean; reclassTarget?: boolean; isHeader?: boolean; isTotal?: boolean; isGrandTotal?: boolean; }
interface ApiTreeNode { accountCode: string; accountName: string; closingDebit: number; closingCredit: number; resolvedLineCode: string | null; children: ApiTreeNode[]; }
interface ApiErrorBody { error?: string; }

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SECTIONS: Record<string, string> = { currentAssets: "流动资产", nonCurrentAssets: "非流动资产", currentLiabilities: "流动负债", nonCurrentLiabilities: "非流动负债", equity: "所有者权益", liabilities: "负债" };
const SECTION_ORDER = ["currentAssets", "nonCurrentAssets", "currentLiabilities", "nonCurrentLiabilities", "equity"];

export default function LineConfigTab() {
  const { company, year } = useStatementConfig();
  const [lines, setLines] = useState<LineCfg[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [accounts, setAccounts] = useState<AcctInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState("");
  const [acctSearch, setAcctSearch] = useState("");
  const [effectiveCodes, setEffectiveCodes] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true); setError(null);
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum)) { setError("年度无效"); setLoading(false); return; }
    const [cr, mr] = await Promise.all([
      fetch(`/api/finance/statement-config?companyCode=${company}&year=${yearNum}`),
      fetch(`/api/finance/statement-mappings?companyCode=${company}&year=${yearNum}&statementType=balance`),
    ]);
    if (!cr.ok || !mr.ok) { setError(`加载失败 (${cr.status}/${mr.status})`); setLoading(false); return; }
    const cj = await cr.json(); const mj = await mr.json();
    setLines((cj.lineConfigs || []).map((l: ApiLineCfg) => ({
      lineCode: l.lineCode, label: l.label, section: l.section,
      reclassSource: !!l.reclassSource, reclassTarget: !!l.reclassTarget,
      isHeader: !!l.isHeader, isTotal: !!l.isTotal, isGrandTotal: !!l.isGrandTotal,
    })));
    setMappings(mj.mappings || []);
    const accts: AcctInfo[] = [];
    const effCodes = new Set<string>();
    const walk = (ns: ApiTreeNode[]) => {
      for (const n of ns) {
        accts.push({ code: n.accountCode, name: n.accountName, closingDebit: n.closingDebit, closingCredit: n.closingCredit });
        if (n.resolvedLineCode) effCodes.add(n.accountCode);
        walk(n.children);
      }
    };
    if (cj.mappingPreview) walk(cj.mappingPreview);
    setAccounts(accts);
    setEffectiveCodes(effCodes);
    setLoading(false);
  }

  useEffect(() => { load(); }, [company, year]);

  async function saveMapping(accountCode: string, lineCode: string, operator: "add" | "subtract") {
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum)) { setError("年度无效"); return; }
    const key = `${lineCode}:${accountCode}`;
    setSaving((p) => new Set(p).add(key));
    const res = await fetch("/api/finance/statement-mappings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyCode: company, year: yearNum, statementType: "balance", accountCode, lineCode, operator }) });
    setSaving((p) => { const n = new Set(p); n.delete(key); return n; });
    if (!res.ok) { const err: ApiErrorBody = await res.json().catch((): ApiErrorBody => ({})); setError(err.error || `保存失败 (${res.status})`); return; }
    load();
  }

  async function removeMapping(accountCode: string) {
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum)) { setError("年度无效"); return; }
    setSaving((p) => new Set(p).add(accountCode));
    const res = await fetch(`/api/finance/statement-mappings?companyCode=${company}&year=${yearNum}&statementType=balance&accountCode=${encodeURIComponent(accountCode)}`, { method: "DELETE" });
    setSaving((p) => { const n = new Set(p); n.delete(accountCode); return n; });
    if (!res.ok) { const err: ApiErrorBody = await res.json().catch((): ApiErrorBody => ({})); setError(err.error || `删除失败 (${res.status})`); return; }
    load();
  }

  async function toggleOperator(accountCode: string, lineCode: string, current: "add" | "subtract") {
    await saveMapping(accountCode, lineCode, current === "add" ? "subtract" : "add");
  }

  const mappingsByLine = useMemo(() => {
    const m = new Map<string, Mapping[]>();
    for (const mp of mappings) { const arr = m.get(mp.lineCode) || []; arr.push(mp); m.set(mp.lineCode, arr); }
    return m;
  }, [mappings]);

  const unmappedAccts = useMemo(() => accounts.filter((a) => !effectiveCodes.has(a.code)), [accounts, effectiveCodes]);
  const filteredAccts = useMemo(() => {
    const q = acctSearch.toLowerCase().trim();
    if (!q) return unmappedAccts;
    return unmappedAccts.filter((a) => a.code.includes(q) || a.name.toLowerCase().includes(q));
  }, [unmappedAccts, acctSearch]);
  const acctMap = useMemo(() => { const m = new Map<string, AcctInfo>(); for (const a of accounts) m.set(a.code, a); return m; }, [accounts]);

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">加载中...</p>;
  if (error) return <div className="rounded-lg bg-red-50 p-8 text-center"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={load} className="text-xs text-red-500 underline hover:text-red-700">重试</button></div>;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b bg-gray-100">
            <tr>
              <th className="px-2 py-2 text-left w-8" />
              <th className="px-2 py-2 text-left">报表项目</th>
              <th className="px-2 py-2 text-left w-24">Section</th>
              <th className="px-2 py-2 text-center w-20">科目</th>
            </tr>
          </thead>
          <tbody>
            {SECTION_ORDER.map((sec) => {
              const secLines = lines.filter((l) => l.section === sec);
              if (!secLines.length) return null;
              return (
                <Fragment key={sec}>
                  <tr className="bg-gray-50"><td colSpan={4} className="px-2 py-1.5 text-[11px] font-medium text-gray-500">{SECTIONS[sec] || sec}</td></tr>
                  {secLines.map((l) => {
                    const special = l.isHeader || l.isTotal || l.isGrandTotal;
                    if (special) {
                      return (
                        <tr key={l.lineCode} className="border-b bg-gray-50/50">
                          <td className="px-2 py-1.5" />
                          <td className={`px-2 py-1.5 font-medium ${l.isHeader ? "text-gray-500" : "text-gray-600"}`}>{l.label}</td>
                          <td className="px-2 py-1.5 text-gray-400 text-[11px]">{SECTIONS[l.section] || l.section}</td>
                          <td className="px-2 py-1.5 text-center text-gray-300">—</td>
                        </tr>
                      );
                    }
                    const isExp = expanded.has(l.lineCode);
                    const lineMappings = mappingsByLine.get(l.lineCode) || [];
                    return (
                      <Fragment key={l.lineCode}>
                        <tr className="border-b cursor-pointer hover:bg-gray-50" onClick={() => { setExpanded((p) => { const n = new Set(p); n.has(l.lineCode) ? n.delete(l.lineCode) : n.add(l.lineCode); return n; }); }}>
                          <td className="px-2 py-1.5 text-gray-300 text-[10px]">{lineMappings.length > 0 ? (isExp ? "▼" : "▶") : ""}</td>
                          <td className="px-2 py-1.5 font-medium text-gray-700">{l.label}</td>
                          <td className="px-2 py-1.5 text-gray-400 text-[11px]">{SECTIONS[l.section] || l.section}</td>
                          <td className="px-2 py-1.5 text-center text-gray-600">{lineMappings.length || "—"}</td>
                        </tr>
                        {isExp && (
                          <tr>
                            <td colSpan={4} className="bg-gray-50 px-4 py-2">
                              {lineMappings.length > 0 && (
                                <table className="w-full text-[11px] mb-2">
                                  <thead><tr className="text-gray-500 border-b"><th className="text-left py-1 font-medium w-20">操作</th><th className="text-left py-1 font-medium">科目编码</th><th className="text-left py-1 font-medium">科目名称</th><th className="text-right py-1 font-medium w-24">期末借方</th><th className="text-right py-1 font-medium w-24">期末贷方</th><th className="text-center py-1 font-medium w-16" /></tr></thead>
                                  <tbody>
                                    {lineMappings.map((m) => {
                                      const a = acctMap.get(m.accountCode);
                                      const isSaving = saving.has(`${l.lineCode}:${m.accountCode}`) || saving.has(m.accountCode);
                                      return (
                                        <tr key={m.accountCode} className="border-b border-gray-100">
                                          <td className="py-1">
                                            <button onClick={() => toggleOperator(m.accountCode, l.lineCode, m.operator)} disabled={isSaving}
                                              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${m.operator === "subtract" ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                                              {isSaving ? "..." : m.operator === "subtract" ? "− 减" : "+ 加"}
                                            </button>
                                          </td>
                                          <td className="py-1 font-mono text-gray-600">{m.accountCode}</td>
                                          <td className="py-1 text-gray-700">{a?.name || m.accountCode}</td>
                                          <td className="py-1 text-right text-gray-600">{a ? fmt(a.closingDebit) : "—"}</td>
                                          <td className="py-1 text-right text-gray-600">{a ? fmt(a.closingCredit) : "—"}</td>
                                          <td className="py-1 text-center">
                                            <button onClick={() => removeMapping(m.accountCode)} disabled={isSaving} className="text-[10px] text-red-400 hover:text-red-600 hover:underline">移除</button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                              {addingFor === l.lineCode ? (
                                <div className="flex flex-col gap-1 mt-1">
                                  <input
                                    type="text" placeholder="搜索科目编码或名称..." value={acctSearch}
                                    onChange={(e) => setAcctSearch(e.target.value)}
                                    className="rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-emerald-400 focus:outline-none w-64"
                                  />
                                  <div className="flex items-center gap-2">
                                    <select value={newAccount} onChange={(e) => setNewAccount(e.target.value)} size={Math.min(filteredAccts.length + 1, 8)}
                                      className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] focus:border-emerald-400 focus:outline-none w-64">
                                      <option value="">— 选择科目 ({filteredAccts.length}) —</option>
                                      {filteredAccts.map((a) => (<option key={a.code} value={a.code}>{a.code} {a.name}</option>))}
                                    </select>
                                    <div className="flex flex-col gap-1">
                                      <button onClick={() => { if (newAccount) saveMapping(newAccount, l.lineCode, "add"); setAddingFor(null); setNewAccount(""); setAcctSearch(""); }} disabled={!newAccount}
                                        className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white hover:bg-emerald-700 disabled:opacity-50">添加 (+)</button>
                                      <button onClick={() => { if (newAccount) saveMapping(newAccount, l.lineCode, "subtract"); setAddingFor(null); setNewAccount(""); setAcctSearch(""); }} disabled={!newAccount}
                                        className="rounded bg-red-500 px-2 py-0.5 text-[10px] text-white hover:bg-red-600 disabled:opacity-50">添加 (−)</button>
                                      <button onClick={() => { setAddingFor(null); setNewAccount(""); setAcctSearch(""); }} className="text-[10px] text-gray-400 hover:text-gray-600">取消</button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => setAddingFor(l.lineCode)} className="mt-1 text-[10px] text-emerald-600 hover:text-emerald-800 hover:underline">+ 添加科目</button>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
