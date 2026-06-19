"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useConfirmDelete } from "@/app/components/ConfirmProvider";
import { SelectField } from "@workspace/core/ui";
import { useStatementConfig } from "./StatementConfigContext";

interface LineCfg { lineCode: string; label: string; section: string; reclassSource: boolean; reclassTarget: boolean; isHeader: boolean; isTotal: boolean; isGrandTotal: boolean; }
interface Mapping { accountCode: string; lineCode: string; operator: "add" | "subtract" | "exclude"; source: string; }
interface AcctInfo { code: string; name: string; closingDebit: number; closingCredit: number; }
interface ApiLineCfg { lineCode: string; label: string; section: string; reclassSource?: boolean; reclassTarget?: boolean; isHeader?: boolean; isTotal?: boolean; isGrandTotal?: boolean; }
interface ApiTreeNode { accountCode: string; accountName: string; closingDebit: number; closingCredit: number; resolvedLineCode: string | null; effectiveOperator: "add" | "subtract" | "exclude" | null; mappingSource: "explicit" | "inherited" | "none"; children: ApiTreeNode[]; }
interface InheritedAcct { accountCode: string; accountName: string; closingDebit: number; closingCredit: number; }
interface ApiErrorBody { error?: string; }

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SECTIONS: Record<string, string> = { currentAssets: "流动资产", nonCurrentAssets: "非流动资产", currentLiabilities: "流动负债", nonCurrentLiabilities: "非流动负债", equity: "所有者权益", liabilities: "负债" };
const SECTION_ORDER = ["currentAssets", "nonCurrentAssets", "currentLiabilities", "nonCurrentLiabilities", "equity"];

export default function LineConfigTab() {
  const { company, year } = useStatementConfig();
  const confirmDelete = useConfirmDelete();
  const [lines, setLines] = useState<LineCfg[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [accounts, setAccounts] = useState<AcctInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState("");
  const [inheritedByLine, setInheritedByLine] = useState<Map<string, InheritedAcct[]>>(new Map());
  const [acctSearch, setAcctSearch] = useState("");
  const [effectiveCodes, setEffectiveCodes] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true); setError(null);
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum)) { setError("年度无效"); setLoading(false); return; }
    const [cr, mr] = await Promise.all([
      fetch(`/workspace/api/finance/statement-config?companyCode=${company}&year=${yearNum}`),
      fetch(`/workspace/api/finance/statement-mappings?companyCode=${company}&year=${yearNum}&statementType=balance`),
    ]);
    if (!cr.ok || !mr.ok) { setError(`加载失败 (${cr.status}/${mr.status})`); setLoading(false); return; }
    const cj = await cr.json(); const mj = await mr.json();
    setLines((cj.lineConfigs || []).map((l: ApiLineCfg) => ({ lineCode: l.lineCode, label: l.label, section: l.section, reclassSource: !!l.reclassSource, reclassTarget: !!l.reclassTarget, isHeader: !!l.isHeader, isTotal: !!l.isTotal, isGrandTotal: !!l.isGrandTotal })));
    setMappings(mj.mappings || []);
    const accts: AcctInfo[] = [];
    const effCodes = new Set<string>();
    const walk = (ns: ApiTreeNode[]) => { for (const n of ns) { accts.push({ code: n.accountCode, name: n.accountName, closingDebit: n.closingDebit, closingCredit: n.closingCredit }); if (n.effectiveOperator === "add") effCodes.add(n.accountCode); walk(n.children); } };
    if (cj.mappingPreview) walk(cj.mappingPreview);
    setAccounts(accts); setEffectiveCodes(effCodes);
    const inh = new Map<string, InheritedAcct[]>();
    const iwalk = (ns: ApiTreeNode[]) => { for (const n of ns) { if (n.mappingSource === "inherited" && n.resolvedLineCode) { const arr = inh.get(n.resolvedLineCode) || []; arr.push({ accountCode: n.accountCode, accountName: n.accountName, closingDebit: n.closingDebit, closingCredit: n.closingCredit }); inh.set(n.resolvedLineCode, arr); } iwalk(n.children); } };
    if (cj.mappingPreview) iwalk(cj.mappingPreview);
    setInheritedByLine(inh);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [company, year]);

  async function saveMapping(accountCode: string, lineCode: string, operator: "add" | "subtract" | "exclude") {
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum)) { setError("年度无效"); return; }
    const key = `${lineCode}:${accountCode}`;
    setSaving((p) => new Set(p).add(key));
    const res = await fetch("/workspace/api/finance/statement-mappings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyCode: company, year: yearNum, statementType: "balance", accountCode, lineCode, operator }) });
    setSaving((p) => { const n = new Set(p); n.delete(key); return n; });
    if (!res.ok) { const err: ApiErrorBody = await res.json().catch((): ApiErrorBody => ({})); setError(err.error || `保存失败 (${res.status})`); return; }
    load();
  }

  async function handleExcludeDefault(accountCode: string, lineCode: string) {
    await saveMapping(accountCode, lineCode, "exclude");
  }

  async function handleRestoreDefault(accountCode: string) {
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum)) { setError("年度无效"); return; }
    const ok = await confirmDelete({
      title: "删除配置",
      message: `确定删除科目 ${accountCode} 的手工配置并恢复默认规则吗？`,
      confirmLabel: "删除配置",
    });
    if (!ok) return;
    setSaving((p) => new Set(p).add(accountCode));
    const res = await fetch(`/workspace/api/finance/statement-mappings?companyCode=${company}&year=${yearNum}&statementType=balance&accountCode=${encodeURIComponent(accountCode)}`, { method: "DELETE" });
    setSaving((p) => { const n = new Set(p); n.delete(accountCode); return n; });
    if (!res.ok) { const err: ApiErrorBody = await res.json().catch((): ApiErrorBody => ({})); setError(err.error || `删除失败 (${res.status})`); return; }
    load();
  }

  async function toggleOperator(accountCode: string, lineCode: string, current: string) {
    await saveMapping(accountCode, lineCode, current === "add" ? "subtract" : "add");
  }

  const mappingsByLine = useMemo(() => {
    const m = new Map<string, Mapping[]>();
    for (const mp of mappings) { const arr = m.get(mp.lineCode) || []; arr.push(mp); m.set(mp.lineCode, arr); }
    for (const arr of m.values()) arr.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return m;
  }, [mappings]);
  const unmappedAccts = useMemo(() => accounts.filter((a) => !effectiveCodes.has(a.code)), [accounts, effectiveCodes]);
  const filteredAccts = useMemo(() => { const q = acctSearch.toLowerCase().trim(); if (!q) return unmappedAccts; return unmappedAccts.filter((a) => a.code.includes(q) || a.name.toLowerCase().includes(q)); }, [unmappedAccts, acctSearch]);
  const acctMap = useMemo(() => { const m = new Map<string, AcctInfo>(); for (const a of accounts) m.set(a.code, a); return m; }, [accounts]);

  function isDefault(m: Mapping) { return m.source === "default" || m.source === "migrated" || m.source === "copied"; }

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">加载中...</p>;
  if (error) return <div className="rounded-lg bg-red-50 p-8 text-center"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={load} className="text-xs text-red-500 underline hover:text-red-700">重试</button></div>;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white"><table className="w-full text-xs">
        <thead className="border-b-2 border-gray-300 bg-gray-200"><tr className="text-gray-800"><th className="px-2 py-2 text-left w-8" /><th className="px-2 py-2 text-left font-semibold">报表项目</th><th className="px-2 py-2 text-left font-semibold w-24">Section</th><th className="px-2 py-2 text-center font-semibold w-20">科目</th></tr></thead>
        <tbody>
          {SECTION_ORDER.map((sec) => {
            const secLines = lines.filter((l) => l.section === sec);
            if (!secLines.length) return null;
            return (<Fragment key={sec}>
              <tr className="bg-gray-50"><td colSpan={4} className="px-2 py-1.5 text-[11px] font-medium text-gray-500">{SECTIONS[sec] || sec}</td></tr>
              {secLines.map((l) => {
                const special = l.isHeader || l.isTotal || l.isGrandTotal;
                if (special) return (<tr key={l.lineCode} className="border-b bg-gray-50/50"><td /><td className={`px-2 py-1.5 font-medium ${l.isHeader ? "text-gray-500" : "text-gray-600"}`}>{l.label}</td><td className="px-2 py-1.5 text-gray-400 text-[11px]">{SECTIONS[l.section] || l.section}</td><td className="px-2 py-1.5 text-center text-gray-300">—</td></tr>);
                const isExp = expanded.has(l.lineCode);
                const lineMappings = mappingsByLine.get(l.lineCode) || [];
                const inhAccts = inheritedByLine.get(l.lineCode) || [];
                const ctxAcctCount = lineMappings.filter((m) => m.operator !== "exclude").length + inhAccts.length;
                return (<Fragment key={l.lineCode}>
                  <tr className="border-b cursor-pointer hover:bg-gray-50" onClick={() => { setExpanded((p) => { const n = new Set(p); if (n.has(l.lineCode)) { n.delete(l.lineCode); } else { n.add(l.lineCode); } return n; }); }}>
                    <td className="px-2 py-1.5 text-gray-300 text-[10px]">{ctxAcctCount > 0 ? (isExp ? "▼" : "▶") : ""}</td>
                    <td className="px-2 py-1.5 font-medium text-gray-700">{l.label}</td>
                    <td className="px-2 py-1.5 text-gray-400 text-[11px]">{SECTIONS[l.section] || l.section}</td>
                    <td className="px-2 py-1.5 text-center text-gray-600">{ctxAcctCount || "—"}</td>
                  </tr>
                  {isExp && (<tr><td colSpan={4} className="bg-gray-50 px-4 py-2">
                    {lineMappings.length > 0 && (<table className="w-full text-[11px] mb-1"><thead><tr className="text-gray-700 border-b-2 border-gray-200"><th className="text-left py-1 font-semibold w-20">操作</th><th className="text-left py-1 font-semibold">科目编码</th><th className="text-left py-1 font-semibold">科目名称</th><th className="text-right py-1 font-semibold w-24">借方</th><th className="text-right py-1 font-semibold w-24">贷方</th><th className="text-center py-1 font-semibold w-20" /></tr></thead>
                    <tbody>{lineMappings.map((m) => { const a = acctMap.get(m.accountCode); const isSaving = saving.has(`${l.lineCode}:${m.accountCode}`) || saving.has(m.accountCode); const dflt = isDefault(m); const excl = m.operator === "exclude"; return (<tr key={m.accountCode} className={`border-b border-gray-100 ${excl ? "bg-gray-100/50" : ""}`}>
                      <td className="py-1">{excl
                        ? <button onClick={() => handleRestoreDefault(m.accountCode)} disabled={isSaving} className="rounded bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-300">{isSaving ? "..." : "恢复默认"}</button>
                        : dflt
                          ? <button onClick={() => handleExcludeDefault(m.accountCode, l.lineCode)} disabled={isSaving} className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100">{isSaving ? "..." : "排除默认"}</button>
                          : <button onClick={() => toggleOperator(m.accountCode, l.lineCode, m.operator)} disabled={isSaving} className={`rounded px-2 py-0.5 text-[10px] font-medium ${m.operator === "subtract" ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>{isSaving ? "..." : m.operator === "subtract" ? "− 减" : "+ 加"}</button>}</td>
                      <td className={`py-1 font-mono ${excl ? "text-gray-400" : "text-gray-600"}`}>{m.accountCode}</td>
                      <td className={`py-1 ${excl ? "text-gray-400" : "text-gray-700"}`}>{a?.name || m.accountCode}</td>
                      <td className={`py-1 text-right ${excl ? "text-gray-300" : "text-gray-600"}`}>{a ? fmt(a.closingDebit) : "—"}</td>
                      <td className={`py-1 text-right ${excl ? "text-gray-300" : "text-gray-600"}`}>{a ? fmt(a.closingCredit) : "—"}</td>
                      <td className="py-1 text-center">
                        {!excl && !dflt && <button onClick={() => handleRestoreDefault(m.accountCode)} disabled={isSaving} className="text-[10px] text-red-400 hover:text-red-600 hover:underline">{isSaving ? "..." : "删除配置"}</button>}
                        {excl && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">已排除</span>}
                        {dflt && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">系统建议</span>}
                      </td></tr>); })}</tbody></table>)}
                    {inhAccts.length > 0 && (<div className="mb-1"><p className="text-[10px] text-gray-400 mb-1">继承科目（来自 prefix/父级）</p>
                      <table className="w-full text-[11px] mb-1"><tbody>{inhAccts.map((a) => { const isSaving = saving.has(`${l.lineCode}:${a.accountCode}`); return (<tr key={a.accountCode} className="border-b border-gray-100"><td className="py-1 w-20"><span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">继承</span></td><td className="py-1 font-mono text-gray-500">{a.accountCode}</td><td className="py-1 text-gray-500">{a.accountName}</td><td className="py-1 text-right text-gray-400">{fmt(a.closingDebit)}</td><td className="py-1 text-right text-gray-400">{fmt(a.closingCredit)}</td><td className="py-1 text-center"><button onClick={() => saveMapping(a.accountCode, l.lineCode, "exclude")} disabled={isSaving} className="text-[10px] text-amber-500 hover:text-amber-700 hover:underline">{isSaving ? "..." : "排除"}</button></td></tr>); })}</tbody></table></div>)}
                    {addingFor === l.lineCode ? (<div className="flex flex-col gap-1 mt-1"><input type="text" placeholder="搜索科目编码或名称..." value={acctSearch} onChange={(e) => setAcctSearch(e.target.value)} className="rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-emerald-400 focus:outline-none w-64" />
                      <div className="flex items-center gap-2"><SelectField value={newAccount} onChange={setNewAccount} placeholder={`选择科目 (${filteredAccts.length})`} options={filteredAccts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))} selectClassName="w-64 px-1.5 py-0.5 text-[11px]" />
                        <div className="flex flex-col gap-1"><button onClick={() => { if (newAccount) saveMapping(newAccount, l.lineCode, "add"); setAddingFor(null); setNewAccount(""); setAcctSearch(""); }} disabled={!newAccount} className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white hover:bg-emerald-700 disabled:opacity-50">添加 (+)</button><button onClick={() => { if (newAccount) saveMapping(newAccount, l.lineCode, "subtract"); setAddingFor(null); setNewAccount(""); setAcctSearch(""); }} disabled={!newAccount} className="rounded bg-red-500 px-2 py-0.5 text-[10px] text-white hover:bg-red-600 disabled:opacity-50">添加 (−)</button><button onClick={() => { setAddingFor(null); setNewAccount(""); setAcctSearch(""); }} className="text-[10px] text-gray-400 hover:text-gray-600">取消</button></div></div></div>) : (<button onClick={() => setAddingFor(l.lineCode)} className="mt-1 text-[10px] text-emerald-600 hover:text-emerald-800 hover:underline">+ 添加科目</button>)}
                  </td></tr>)}
                </Fragment>);
              })}
            </Fragment>);
          })}
        </tbody>
      </table></div>
    </div>
  );
}
