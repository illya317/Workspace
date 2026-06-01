"use client";

import { useEffect, useState, useMemo, Fragment } from "react";

// ─── Types ─────────────────────────────────────────────────

interface MappingNode {
  accountCode: string; accountName: string; level: number;
  closingDebit: number; closingCredit: number; net: number;
  resolvedLineCode: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  ancestorAccountCode: string | null;
  children: MappingNode[];
}
interface LineConfig { lineCode: string; label: string; section: string; reclassSource: boolean; reclassTarget: boolean; }
interface Acct { accountCode: string; accountName: string; level: number; closingDebit: number; closingCredit: number; net: number; mappingSource: "explicit" | "inherited" | "none"; ancestorAccountCode: string | null; }

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SECTIONS: Record<string, string> = { currentAssets: "流动资产", nonCurrentAssets: "非流动资产", currentLiabilities: "流动负债", nonCurrentLiabilities: "非流动负债", equity: "所有者权益", liabilities: "负债" };

// ─── Component ─────────────────────────────────────────────

export default function ConfigTab() {
  const [company, setCompany] = useState("02");
  const [year, setYear] = useState("2025");
  const [lines, setLines] = useState<LineConfig[]>([]);
  const [tree, setTree] = useState<MappingNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true); setError(null);
    const res = await fetch(`/api/finance/statement-config?companyCode=${company}&year=${year}`);
    if (!res.ok) { setError(`请求失败 (${res.status})`); setLoading(false); return; }
    const data = await res.json();
    setLines((data.lineConfigs || []).map((l: any) => ({ lineCode: l.lineCode, label: l.label, section: l.section, reclassSource: !!l.reclassSource, reclassTarget: !!l.reclassTarget })));
    setTree(data.mappingPreview || []);
    setLoading(false);
  }

  async function saveReclass() {
    setSaving(true);
    const body = { companyCode: company, year: parseInt(year), lines: lines.map((l) => ({ lineCode: l.lineCode, reclassSource: l.reclassSource, reclassTarget: l.reclassTarget })) };
    const res = await fetch("/api/finance/statement-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setMsg(res.ok ? "保存成功" : "保存失败"); setSaving(false); setTimeout(() => setMsg(""), 2000);
  }

  useEffect(() => { load(); }, [company, year]);

  function toggleLine(code: string) { setExpanded((p) => { const n = new Set(p); if (n.has(code)) n.delete(code); else n.add(code); return n; }); }
  function toggleReclass(lineCode: string, f: "reclassSource" | "reclassTarget") { setLines((p) => p.map((l) => l.lineCode === lineCode ? { ...l, [f]: !l[f] } : l)); }

  // group account tree by effective resolvedLineCode
  const { grouped, unmapped, lineLabelMap } = useMemo(() => {
    const g = new Map<string, Acct[]>();
    const u: Acct[] = [];
    const walk = (ns: MappingNode[]) => {
      for (const n of ns) {
        const a: Acct = { accountCode: n.accountCode, accountName: n.accountName, level: n.level, closingDebit: n.closingDebit, closingCredit: n.closingCredit, net: n.net, mappingSource: n.mappingSource, ancestorAccountCode: n.ancestorAccountCode };
        if (n.resolvedLineCode) { const arr = g.get(n.resolvedLineCode) || []; arr.push(a); g.set(n.resolvedLineCode, arr); }
        else { u.push(a); }
        walk(n.children);
      }
    };
    if (tree) walk(tree);
    const llm = new Map<string, string>(); for (const l of lines) llm.set(l.lineCode, l.label);
    return { grouped: g, unmapped: u, lineLabelMap: llm };
  }, [tree, lines]);

  const sectionOrder = ["currentAssets", "nonCurrentAssets", "currentLiabilities", "nonCurrentLiabilities", "equity"];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3">
        <select value={company} onChange={(e) => setCompany(e.target.value)} className="rounded border px-2 py-1 text-sm">
          <option value="01">丰华生物</option><option value="02">天力通</option><option value="03">丰华悦通</option><option value="05">加拿大</option><option value="06">上海悦通</option>
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} className="rounded border px-2 py-1 text-sm">
          {["2024","2025","2026"].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={saveReclass} disabled={saving} className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700">{saving ? "保存中..." : "保存重分类"}</button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-8 text-center"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={load} className="text-xs text-red-500 underline hover:text-red-700">重试</button></div>}
      {!error && loading && <p className="text-sm text-gray-400 py-8 text-center">加载中...</p>}

      {!error && !loading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-100">
              <tr>
                <th className="px-2 py-1.5 text-left w-8" />
                <th className="px-2 py-1.5 text-left">报表项目</th>
                <th className="px-2 py-1.5 text-left w-28">Section</th>
                <th className="px-2 py-1.5 text-center w-16">科目数</th>
                <th className="px-2 py-1.5 text-center w-16">重分类源</th>
                <th className="px-2 py-1.5 text-center w-16">重分类目标</th>
              </tr>
            </thead>
            <tbody>
              {/* Section groups */}
              {sectionOrder.map((sec) => {
                const secLines = lines.filter((l) => l.section === sec);
                if (!secLines.length) return null;
                return (
                  <Fragment key={sec}>
                    <tr className="bg-gray-50"><td colSpan={6} className="px-2 py-1 text-[11px] font-medium text-gray-500">{SECTIONS[sec] || sec}</td></tr>
                    {secLines.map((l) => {
                      const isExp = expanded.has(l.lineCode);
                      const accts = grouped.get(l.lineCode) || [];
                      return (
                        <Fragment key={l.lineCode}>
                          <tr className="border-b cursor-pointer hover:bg-gray-50" onClick={() => accts.length > 0 && toggleLine(l.lineCode)}>
                            <td className="px-2 py-1 text-gray-300 text-[10px]">{accts.length > 0 ? (isExp ? "▼" : "▶") : ""}</td>
                            <td className="px-2 py-1 font-medium text-gray-700">{l.label}</td>
                            <td className="px-2 py-1 text-gray-400">{SECTIONS[l.section] || l.section}</td>
                            <td className="px-2 py-1 text-center text-gray-600">{accts.length || "—"}</td>
                            <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={l.reclassSource} onChange={() => toggleReclass(l.lineCode, "reclassSource")} /></td>
                            <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={l.reclassTarget} onChange={() => toggleReclass(l.lineCode, "reclassTarget")} /></td>
                          </tr>
                          {isExp && accts.length > 0 && (
                            <tr>
                              <td colSpan={6} className="bg-gray-50 px-4 py-2">
                                <table className="w-full text-[11px]">
                                  <thead><tr className="text-gray-500 border-b"><th className="text-left py-1 font-medium">科目编码</th><th className="text-left py-1 font-medium">科目名称</th><th className="text-right py-1 font-medium w-20">期末借方</th><th className="text-right py-1 font-medium w-20">期末贷方</th><th className="text-right py-1 font-medium w-20">净值</th><th className="text-left py-1 font-medium w-20">来源</th></tr></thead>
                                  <tbody>
                                    {accts.map((a) => (
                                      <tr key={a.accountCode} className="border-b border-gray-100">
                                        <td className="py-1 font-mono text-gray-600">{a.accountCode}</td>
                                        <td className="py-1 text-gray-700">{a.accountName}</td>
                                        <td className="py-1 text-right text-gray-600">{fmt(a.closingDebit)}</td>
                                        <td className="py-1 text-right text-gray-600">{fmt(a.closingCredit)}</td>
                                        <td className={`py-1 text-right font-medium ${a.net < 0 ? "text-red-600" : "text-gray-700"}`}>{fmt(Math.abs(a.net))}</td>
                                        <td className="py-1">{a.mappingSource === "explicit" ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">直接</span> : a.mappingSource === "inherited" ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">继承{a.ancestorAccountCode ? ` (${a.ancestorAccountCode})` : ""}</span> : <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">未映射</span>}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
              {/* Unmapped group */}
              {unmapped.length > 0 && (
                <Fragment>
                  <tr className="bg-red-50"><td colSpan={6} className="px-2 py-1 text-[11px] font-medium text-red-500">未映射科目 ({unmapped.length})</td></tr>
                  {unmapped.map((a) => (
                    <tr key={a.accountCode} className="border-b bg-red-50/50 text-xs">
                      <td className="px-2 py-1" />
                      <td className="px-2 py-1 font-mono text-gray-600">{a.accountCode}</td>
                      <td className="px-2 py-1 text-gray-500">{a.accountName}</td>
                      <td className="px-2 py-1 text-right text-gray-500">{fmt(a.closingDebit)}</td>
                      <td className="px-2 py-1 text-right text-gray-500">{fmt(a.closingCredit)}</td>
                      <td className="px-2 py-1 text-right text-gray-500">{fmt(Math.abs(a.net))}</td>
                    </tr>
                  ))}
                </Fragment>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
