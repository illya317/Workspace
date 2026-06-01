"use client";

import { useEffect, useState } from "react";

interface ConfigLine {
  lineCode: string; label: string; section: string;
  reclassSource: boolean; reclassTarget: boolean;
}
interface MappingRow { accountCode: string; lineCode: string; source: string; note?: string | null; }

const SECTION_NAMES: Record<string, string> = {
  currentAssets: "流动资产", nonCurrentAssets: "非流动资产",
  currentLiabilities: "流动负债", nonCurrentLiabilities: "非流动负债",
  equity: "所有者权益", liabilities: "负债",
};

export default function ConfigTab() {
  const [company, setCompany] = useState("02");
  const [year, setYear] = useState("2025");
  const [lines, setLines] = useState<ConfigLine[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true); setError(null);
    const [lr, mr] = await Promise.all([
      fetch(`/api/finance/statement-config?companyCode=${company}&year=${year}`),
      fetch(`/api/finance/statement-mappings?companyCode=${company}&year=${year}&statementType=balance`),
    ]);
    if (!lr.ok || !mr.ok) {
      setError("加载失败");
      setLoading(false);
      return;
    }
    const lj = await lr.json();
    const mj = await mr.json();
    setLines((lj.lineConfigs || []).map((l: any) => ({ lineCode: l.lineCode, label: l.label, section: l.section, reclassSource: l.reclassSource || false, reclassTarget: l.reclassTarget || false })));
    setMappings(mj.mappings || []);
    setLoading(false);
  }

  async function saveReclass() {
    setSaving(true);
    const body = { companyCode: company, year: parseInt(year), lines: lines.map((l) => ({ lineCode: l.lineCode, reclassSource: l.reclassSource, reclassTarget: l.reclassTarget })) };
    const res = await fetch("/api/finance/statement-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setMsg(res.ok ? "保存成功" : "保存失败");
    setSaving(false);
    setTimeout(() => setMsg(""), 2000);
  }

  useEffect(() => { load(); }, [company, year]);

  function toggleLine(code: string) {
    setExpanded((prev) => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  }
  function toggleReclass(lineCode: string, field: "reclassSource" | "reclassTarget") {
    setLines((prev) => prev.map((l) => l.lineCode === lineCode ? { ...l, [field]: !l[field] } : l));
  }

  const mappingsByLine = new Map<string, MappingRow[]>();
  for (const m of mappings) {
    const list = mappingsByLine.get(m.lineCode) || [];
    list.push(m);
    mappingsByLine.set(m.lineCode, list);
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3">
        <select value={company} onChange={(e) => setCompany(e.target.value)} className="rounded border px-2 py-1 text-sm">
          <option value="01">丰华生物</option><option value="02">天力通</option>
          <option value="03">丰华悦通</option><option value="05">加拿大</option><option value="06">上海悦通</option>
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} className="rounded border px-2 py-1 text-sm">
          {["2024","2025","2026"].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={saveReclass} disabled={saving} className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700">{saving ? "保存中..." : "保存重分类"}</button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-8 text-center"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={load} className="text-xs text-red-500 underline hover:text-red-700">重试</button></div>}

      {!error && loading && <p className="text-sm text-gray-400">加载中...</p>}

      {!error && !loading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-100">
              <tr>
                <th className="px-2 py-1 text-left w-8" />
                <th className="px-2 py-1 text-left">报表项目</th>
                <th className="px-2 py-1 text-left">Section</th>
                <th className="px-2 py-1 text-center w-20">科目数</th>
                <th className="px-2 py-1 text-center w-16">重分类源</th>
                <th className="px-2 py-1 text-center w-16">重分类目标</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const isExp = expanded.has(l.lineCode);
                const accts = mappingsByLine.get(l.lineCode) || [];
                return (
                  <tbody key={l.lineCode}>
                    <tr className="border-b cursor-pointer hover:bg-gray-50" onClick={() => toggleLine(l.lineCode)}>
                      <td className="px-2 py-1 text-gray-300 text-[10px]">{accts.length > 0 ? (isExp ? "▼" : "▶") : ""}</td>
                      <td className="px-2 py-1 font-medium text-gray-700">{l.label}</td>
                      <td className="px-2 py-1 text-gray-500">{SECTION_NAMES[l.section] || l.section}</td>
                      <td className="px-2 py-1 text-center text-gray-600">{accts.length || "—"}</td>
                      <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={l.reclassSource} onChange={() => toggleReclass(l.lineCode, "reclassSource")} />
                      </td>
                      <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={l.reclassTarget} onChange={() => toggleReclass(l.lineCode, "reclassTarget")} />
                      </td>
                    </tr>
                    {isExp && accts.length > 0 && (
                      <tr key={`${l.lineCode}-detail`}>
                        <td colSpan={6} className="bg-gray-50 px-4 py-2">
                          <table className="w-full text-[11px]">
                            <thead><tr className="text-gray-500 border-b"><th className="text-left py-1 font-medium">科目编码</th><th className="text-left py-1 font-medium">来源</th><th className="text-left py-1 font-medium">备注</th></tr></thead>
                            <tbody>
                              {accts.map((a) => (
                                <tr key={a.accountCode} className="border-b border-gray-100">
                                  <td className="py-1 font-mono text-gray-600">{a.accountCode}</td>
                                  <td className="py-1 text-gray-500">{a.source === "manual" ? "手动" : a.source === "copied" ? "继承" : a.source === "migrated" ? "迁移" : a.source}</td>
                                  <td className="py-1 text-gray-400">{a.note || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
