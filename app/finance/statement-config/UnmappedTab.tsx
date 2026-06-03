"use client";

import { useEffect, useState } from "react";
import { useStatementConfig } from "./StatementConfigContext";

interface Node {
  accountCode: string; accountName: string; level: number;
  closingDebit: number; closingCredit: number; net: number;
  resolvedLineCode: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  effectiveOperator: "add" | "subtract" | "exclude" | null;
  children: Node[];
}

type Status = "unmapped" | "subtractOnly" | "excluded";

interface DisplayItem {
  accountCode: string; accountName: string; level: number;
  closingDebit: number; closingCredit: number; net: number;
  status: Status;
  subtractSourceLine: string | null;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function UnmappedTab() {
  const { company, year } = useStatementConfig();
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lineLabelMap, setLineLabelMap] = useState<Map<string, string>>(new Map());

  async function load() {
    setLoading(true); setError(null);
    const res = await fetch(`/api/finance/statement-config?companyCode=${company}&year=${year}`);
    if (!res.ok) { setError(`请求失败 (${res.status})`); setLoading(false); return; }
    const data = await res.json();
    // Build lineCode → label map
    const llm = new Map<string, string>();
    for (const l of (data.lineConfigs || [])) llm.set(l.lineCode, l.label);
    setLineLabelMap(llm);

    const result: DisplayItem[] = [];
    const walk = (ns: Node[]) => {
      for (const n of ns) {
        const hasBalance = Math.abs(n.closingDebit) > 0.01 || Math.abs(n.closingCredit) > 0.01;
        if (!hasBalance) { walk(n.children); continue; }

        if (n.effectiveOperator === "add") { walk(n.children); continue; }
        if (n.effectiveOperator === "exclude") {
          result.push({
            accountCode: n.accountCode, accountName: n.accountName, level: n.level,
            closingDebit: n.closingDebit, closingCredit: n.closingCredit, net: n.net,
            status: "excluded",
            subtractSourceLine: null,
          });
        } else if (n.effectiveOperator === "subtract") {
          result.push({
            accountCode: n.accountCode, accountName: n.accountName, level: n.level,
            closingDebit: n.closingDebit, closingCredit: n.closingCredit, net: n.net,
            status: "subtractOnly",
            subtractSourceLine: n.resolvedLineCode,
          });
        } else if (n.mappingSource === "none") {
          result.push({
            accountCode: n.accountCode, accountName: n.accountName, level: n.level,
            closingDebit: n.closingDebit, closingCredit: n.closingCredit, net: n.net,
            status: "unmapped",
            subtractSourceLine: null,
          });
        }
        walk(n.children);
      }
    };
    if (data.mappingPreview) walk(data.mappingPreview);
    setItems(result.sort((a, b) => a.accountCode.localeCompare(b.accountCode)));
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [company, year]);

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">加载中...</p>;
  if (error) return <div className="rounded-lg bg-red-50 p-8 text-center"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={load} className="text-xs text-red-500 underline hover:text-red-700">重试</button></div>;

  const subtractOnly = items.filter((a) => a.status === "subtractOnly");
  const unmappedOnly = items.filter((a) => a.status === "unmapped");
  const excluded = items.filter((a) => a.status === "excluded");

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="rounded-lg bg-emerald-50 p-8 text-center">
          <p className="text-sm text-emerald-600">全部科目已正常归属，无遗漏</p>
        </div>
      ) : (
        <>
          <div className="flex gap-4 text-xs text-gray-500">
            <span>未映射: <b className="text-red-500">{unmappedOnly.length}</b></span>
            {subtractOnly.length > 0 && (
              <span>仅减项: <b className="text-amber-600">{subtractOnly.length}</b></span>
            )}
            {excluded.length > 0 && (
              <span>已排除: <b className="text-gray-600">{excluded.length}</b></span>
            )}
            <span className="text-gray-400">（余额非零但未被 add 消费）</span>
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
                  <th className="px-2 py-2 text-left font-semibold w-32">状态</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.accountCode} className={`border-b ${a.status === "unmapped" ? "bg-red-50/60" : a.status === "excluded" ? "bg-gray-50" : "bg-amber-50/50"}`}>
                    <td className="px-2 py-1.5 font-mono text-gray-600">{a.accountCode}</td>
                    <td className="px-2 py-1.5 text-gray-700">{a.accountName}</td>
                    <td className="px-2 py-1.5 text-center text-gray-500">L{a.level}</td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{fmt(a.closingDebit)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{fmt(a.closingCredit)}</td>
                    <td className={`px-2 py-1.5 text-right font-medium ${a.net < 0 ? "text-red-600" : "text-gray-700"}`}>{fmt(Math.abs(a.net))}</td>
                    <td className="px-2 py-1.5">
                      {a.status === "excluded" ? (
                        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">已排除</span>
                      ) : a.status === "subtractOnly" ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          仅减项 → {a.subtractSourceLine ? (lineLabelMap.get(a.subtractSourceLine) || a.subtractSourceLine) : "?"}
                        </span>
                      ) : (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">未映射</span>
                      )}
                    </td>
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
