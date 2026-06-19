"use client";

import { useMemo, useState } from "react";
import { AnalysisBlock, SearchInput } from "@workspace/core/ui";
import type { Contract } from "./useAnalyticsData";
import StatCard from "./shared/StatCard";
import { enrichContracts, computeStats, filterContracts, statusBadge, statusLabel } from "./contract-helpers";

export default function ContractAnalytics({ contracts }: { contracts: Contract[] }) {
  const [filter, setFilter] = useState<"all" | "expiring30" | "expiring90" | "expired">("all");
  const [search, setSearch] = useState("");

  const enriched = useMemo(() => enrichContracts(contracts), [contracts]);
  const stats = useMemo(() => computeStats(enriched), [enriched]);
  const filtered = useMemo(() => filterContracts(enriched, filter, search), [enriched, filter, search]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="主合同总数" value={stats.total} color="emerald" sub={`${stats.permanent} 个无固定期限`} />
        <StatCard label="30天内到期" value={stats.expiring30} color="rose" />
        <StatCard label="90天内到期" value={stats.expiring90} color="amber" sub="含30天内" />
        <StatCard label="已到期" value={stats.expired} color="red" />
        <StatCard label="无固定期限" value={stats.permanent} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalysisBlock title="合同类型分布">
          <div className="space-y-2">
            {stats.types.map(([k, v]) => {
              const max = Math.max(...stats.types.map(([, x]) => x), 1);
              const pct = Math.round((v / max) * 100);
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-gray-600 truncate">{k}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-sky-400 rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-gray-700">{v}</span>
                </div>
              );
            })}
          </div>
        </AnalysisBlock>

        <AnalysisBlock title="公司合同分布">
          <div className="space-y-2">
            {stats.companies.map(([k, v]) => {
              const max = Math.max(...stats.companies.map(([, x]) => x), 1);
              const pct = Math.round((v / max) * 100);
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-gray-600 truncate">{k}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-purple-400 rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-gray-700">{v}</span>
                </div>
              );
            })}
          </div>
        </AnalysisBlock>
      </div>

      <AnalysisBlock
        title="合同到期预警"
        toolbar={
          <div className="flex flex-1 items-center gap-3">
          <div className="flex gap-1">
            {(["all", "expiring30", "expiring90", "expired"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded ${filter === f ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {f === "all" ? "全部" : f === "expiring30" ? "30天" : f === "expiring90" ? "90天" : "已到期"}
              </button>
            ))}
          </div>
          <SearchInput
            placeholder="搜索姓名、工号、公司..."
            value={search}
            onChange={setSearch}
            size="toolbar"
            className="ml-auto max-w-xs"
          />
          <span className="text-xs text-gray-400">{filtered.length} 人</span>
          </div>
        }
      >

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">工号</th>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">公司</th>
                <th className="px-4 py-3 font-medium">合同类型</th>
                <th className="px-4 py-3 font-medium">最近到期日</th>
                <th className="px-4 py-3 font-medium">剩余天数</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filtered.slice(0, 100).map((c) => (
                <tr key={c.id} className={`hover:bg-emerald-50/20 ${c.status === "expired" ? "bg-red-50/40" : c.status === "expiring30" ? "bg-rose-50/30" : ""}`}>
                  <td className="px-4 py-3 font-mono text-slate-500">{c.employeeId}</td>
                  <td className="px-4 py-3 font-medium">{c.employeeName}</td>
                  <td className="px-4 py-3 text-slate-500">{c.company || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{c.contractType || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{c.nearestEnd || "—"}</td>
                  <td className="px-4 py-3">
                    {c.daysLeft === null || (typeof c.daysLeft === 'number' && isNaN(c.daysLeft)) ? (
                      <span className="text-gray-400">—</span>
                    ) : c.daysLeft < 0 ? (
                      <span className="text-red-600 font-medium">超{Math.abs(c.daysLeft)}天</span>
                    ) : (
                      <span className={`font-medium ${c.daysLeft <= 30 ? "text-rose-600" : c.daysLeft <= 90 ? "text-amber-600" : "text-gray-600"}`}>
                        {c.daysLeft}天
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${statusBadge(c.status)}`}>
                      {statusLabel(c.status)}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-gray-400">暂无数据</td></tr>
              )}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p className="text-xs text-gray-400 text-center py-2">还有 {filtered.length - 100} 条，请使用搜索或筛选</p>
          )}
        </div>
      </AnalysisBlock>
    </div>
  );
}
