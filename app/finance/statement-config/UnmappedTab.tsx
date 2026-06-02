"use client";

import { useEffect, useState, useMemo } from "react";
import { useStatementConfig } from "./StatementConfigContext";

interface Node { accountCode: string; accountName: string; level: number; closingDebit: number; closingCredit: number; net: number; resolvedLineCode: string | null; children: Node[]; }

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function UnmappedTab() {
  const { company, year } = useStatementConfig();
  const [unmapped, setUnmapped] = useState<(Node & { consumed: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    const res = await fetch(`/api/finance/statement-config?companyCode=${company}&year=${year}`);
    if (!res.ok) { setError(`请求失败 (${res.status})`); setLoading(false); return; }
    const data = await res.json();
    // Collect all accounts with non-zero balance that are NOT consumed by any mapping
    const result: (Node & { consumed: boolean })[] = [];
    const walk = (ns: Node[]) => {
      for (const n of ns) {
        const hasBalance = Math.abs(n.closingDebit) > 0.01 || Math.abs(n.closingCredit) > 0.01;
        const isConsumed = n.resolvedLineCode !== null;
        if (hasBalance && !isConsumed) {
          result.push({ ...n, consumed: false });
        }
        walk(n.children);
      }
    };
    if (data.mappingPreview) walk(data.mappingPreview);
    setUnmapped(result.sort((a, b) => a.accountCode.localeCompare(b.accountCode)));
    setLoading(false);
  }

  useEffect(() => { load(); }, [company, year]);

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">加载中...</p>;
  if (error) return <div className="rounded-lg bg-red-50 p-8 text-center"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={load} className="text-xs text-red-500 underline hover:text-red-700">重试</button></div>;

  return (
    <div className="space-y-4">
      {unmapped.length === 0 ? (
        <div className="rounded-lg bg-emerald-50 p-8 text-center">
          <p className="text-sm text-emerald-600">✓ 全部科目已被报表项目消费，无遗漏</p>
        </div>
      ) : (
        <>
          <div className="flex gap-4 text-xs text-gray-500">
            <span>遗漏科目: <b className="text-red-500">{unmapped.length}</b> 个</span>
            <span className="text-gray-400">（余额非零且未被任何报表项目消费）</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="border-b-2 border-gray-300 bg-gray-200">
                <tr className="text-gray-800">
                  <th className="px-2 py-2 text-left font-semibold">科目编码</th>
                  <th className="px-2 py-2 text-left font-semibold">科目名称</th>
                  <th className="px-2 py-2 text-center font-semibold w-16">层级</th>
                  <th className="px-2 py-2 text-right font-semibold w-28">期末借方</th>
                  <th className="px-2 py-2 text-right font-semibold w-28">期末贷方</th>
                  <th className="px-2 py-2 text-right font-semibold w-28">净值</th>
                </tr>
              </thead>
              <tbody>
                {unmapped.map((a) => (
                  <tr key={a.accountCode} className={`border-b ${a.net !== 0 ? "bg-red-50/60" : ""}`}>
                    <td className="px-2 py-1.5 font-mono text-gray-600">{a.accountCode}</td>
                    <td className="px-2 py-1.5 text-gray-700">{a.accountName}</td>
                    <td className="px-2 py-1.5 text-center text-gray-500">L{a.level}</td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{fmt(a.closingDebit)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{fmt(a.closingCredit)}</td>
                    <td className={`px-2 py-1.5 text-right font-medium ${a.net < 0 ? "text-red-600" : "text-gray-700"}`}>{fmt(Math.abs(a.net))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
