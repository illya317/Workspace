"use client";

import { useEffect, useState } from "react";

interface ConfigLine {
  lineCode: string; label: string; displayCode: string; section: string;
  prefixes: string[]; subtractPrefixes: string[];
  reclassSource: boolean; reclassTarget: boolean;
  isHeader: boolean; isTotal: boolean; isGrandTotal: boolean; enabled: boolean;
}

const SECTION_NAMES: Record<string, string> = {
  currentAssets: "流动资产", nonCurrentAssets: "非流动资产",
  currentLiabilities: "流动负债", nonCurrentLiabilities: "非流动负债",
  equity: "所有者权益", liabilities: "负债",
};

export default function ConfigTab() {
  const [company, setCompany] = useState("02");
  const [year, setYear] = useState("2025");
  const [lines, setLines] = useState<ConfigLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    const res = await fetch(`/api/finance/statement-config?companyCode=${company}&year=${year}`);
    if (res.ok) {
      const data = await res.json();
      setLines(data.lineConfigs || []);
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error || `请求失败 (${res.status})`);
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/finance/statement-config", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyCode: company, year: parseInt(year), lines }),
    });
    setMsg(res.ok ? "保存成功" : "保存失败");
    setSaving(false);
    setTimeout(() => setMsg(""), 2000);
  }

  useEffect(() => { load(); }, [company, year]);

  function updateLine(lineCode: string, field: string, value: any) {
    setLines((prev) => prev.map((l) => l.lineCode === lineCode ? { ...l, [field]: value } : l));
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
        <button onClick={save} disabled={saving} className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700">
          {saving ? "保存中..." : "保存"}
        </button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-8 text-center">
          <p className="text-sm text-red-600 mb-2">{error}</p>
          <button onClick={load} className="text-xs text-red-500 underline hover:text-red-700">重试</button>
        </div>
      )}

      {!error && loading ? <p className="text-sm text-gray-400">加载中...</p> : !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-100">
              <tr>
                <th className="px-2 py-1 text-left">报表项目</th>
                <th className="px-2 py-1 text-left">Section</th>
                <th className="px-2 py-1 text-left">收纳科目 (prefixes)</th>
                <th className="px-2 py-1 text-left">减项 (subtract)</th>
                <th className="px-2 py-1 text-center w-16">重分类源</th>
                <th className="px-2 py-1 text-center w-16">重分类目标</th>
              </tr>
            </thead>
            <tbody>
              {lines.filter((l) => !l.isHeader && !l.isTotal && !l.isGrandTotal).map((l) => (
                <tr key={l.lineCode} className="border-b">
                  <td className="px-2 py-1 font-medium text-gray-700">{l.label}</td>
                  <td className="px-2 py-1 text-gray-500">{SECTION_NAMES[l.section] || l.section}</td>
                  <td className="px-2 py-1">
                    <input value={l.prefixes?.join(", ") || ""}
                      onChange={(e) => updateLine(l.lineCode, "prefixes", e.target.value.split(/[, ]+/).filter(Boolean))}
                      className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs focus:border-emerald-400 focus:outline-none" />
                  </td>
                  <td className="px-2 py-1">
                    <input value={l.subtractPrefixes?.join(", ") || ""}
                      onChange={(e) => updateLine(l.lineCode, "subtractPrefixes", e.target.value.split(/[, ]+/).filter(Boolean))}
                      className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs focus:border-emerald-400 focus:outline-none" />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <input type="checkbox" checked={l.reclassSource} onChange={(e) => updateLine(l.lineCode, "reclassSource", e.target.checked)} />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <input type="checkbox" checked={l.reclassTarget} onChange={(e) => updateLine(l.lineCode, "reclassTarget", e.target.checked)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
