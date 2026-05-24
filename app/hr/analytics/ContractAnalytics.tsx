"use client";

import { useMemo, useState } from "react";
import type { Contract } from "./useAnalyticsData";

function StatCard({ label, value, sub, color = "emerald" }: { label: string; value: string | number; sub?: string; color?: string }) {
  const cm: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-lg p-4 ${cm[color] || cm.emerald}`}>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-[10px] opacity-70">{sub}</div>}
      <div className="mt-0.5 text-xs opacity-80">{label}</div>
    </div>
  );
}

// 找出最主要的到期日（最近的合同结束日期）
function isValidDate(s: string): boolean {
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function nearestEndDate(c: Contract): string | null {
  // 取所有有效日期（排除非日期文本如"无限期"）
  const allDates = [
    c.endDate, c.firstContractEndDate, c.secondContractEndDate,
    c.thirdContractEndDate, c.permanentContractDate,
  ].filter((v): v is string => !!v && isValidDate(v));
  if (allDates.length === 0) return null;
  // 找未来最近的到期日（不是历史最早的）
  const now = Date.now();
  const upcoming = allDates.filter(d => new Date(d).getTime() >= now).sort();
  if (upcoming.length > 0) return upcoming[0];
  // 全部已过期，返回最近过期的
  return allDates.sort().reverse()[0];
}

function hasPermanentContract(c: Contract): boolean {
  // 有 permanentContractDate 或任何日期字段值为非数字文本（如"无限期"）
  if (c.permanentContractDate) return true;
  const dateFields = [c.endDate, c.firstContractEndDate, c.secondContractEndDate, c.thirdContractEndDate];
  return dateFields.some((v) => v && !isValidDate(v) && /无|长期|永久|无限/.test(v));
}

function daysUntil(dateStr: string): number {
  if (!isValidDate(dateStr)) return NaN;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function ContractAnalytics({ contracts }: { contracts: Contract[] }) {
  const [filter, setFilter] = useState<"all" | "expiring30" | "expiring90" | "expired">("all");
  const [search, setSearch] = useState("");

  const enriched = useMemo(() => {
    return contracts
      .filter((c) => c.isPrimary)
      .map((c) => {
        const isPermanent = hasPermanentContract(c);
        if (isPermanent) {
          const end = nearestEndDate(c);
          const days = end ? daysUntil(end) : null;
          // 无固定期限：如果所有固定合同都已到期（days<0或无效），算有效；否则按最近到期日判断
          const effectiveDays = (days !== null && !isNaN(days)) ? days : null;
          let status: "expired" | "expiring30" | "expiring90" | "active" | "permanent" = "permanent";
          if (effectiveDays !== null && effectiveDays >= 0) {
            status = effectiveDays <= 30 ? "expiring30" : effectiveDays <= 90 ? "expiring90" : "permanent";
          }
          return { ...c, nearestEnd: end, daysLeft: effectiveDays, status };
        }
        const end = nearestEndDate(c);
        const days = end ? daysUntil(end) : null;
        if (days !== null) {
          if (days < 0) status = "expired";
          else if (days <= 30) status = "expiring30";
          else if (days <= 90) status = "expiring90";
        }
        return { ...c, nearestEnd: end, daysLeft: days, status };
      })
      .sort((a, b) => {
        if (a.status === "expired" && b.status !== "expired") return -1;
        if (b.status === "expired" && a.status !== "expired") return 1;
        if (a.daysLeft === null && b.daysLeft === null) return a.employeeName.localeCompare(b.employeeName);
        if (a.daysLeft === null) return 1;
        if (b.daysLeft === null) return -1;
        return a.daysLeft - b.daysLeft;
      });
  }, [contracts]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const expired = enriched.filter((c) => c.status === "expired").length;
    const expiring30 = enriched.filter((c) => c.status === "expiring30").length;
    const expiring90 = enriched.filter((c) => c.status === "expiring90").length;
    const permanent = enriched.filter((c) => c.status === "permanent").length;

    // 合同类型分布
    const typeMap = new Map<string, number>();
    enriched.forEach((c) => {
      const t = c.contractType || "未知";
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
    });
    const types = [...typeMap.entries()].sort((a, b) => b[1] - a[1]);

    // 公司分布
    const companyMap = new Map<string, number>();
    enriched.forEach((c) => {
      const co = c.company || "未知";
      companyMap.set(co, (companyMap.get(co) || 0) + 1);
    });
    const companies = [...companyMap.entries()].sort((a, b) => b[1] - a[1]);

    return { total, expired, expiring30, expiring90, permanent, types, companies };
  }, [enriched]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (filter === "expiring30") list = enriched.filter((c) => c.status === "expiring30");
    else if (filter === "expiring90") list = enriched.filter((c) => c.status === "expiring30" || c.status === "expiring90");
    else if (filter === "expired") list = enriched.filter((c) => c.status === "expired");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.employeeName.toLowerCase().includes(q) ||
        c.employeeId.toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [enriched, filter, search]);

  const statusBadge = (s: string) => {
    switch (s) {
      case "expired": return "bg-red-100 text-red-700";
      case "expiring30": return "bg-rose-100 text-rose-700";
      case "expiring90": return "bg-amber-100 text-amber-700";
      case "permanent": return "bg-blue-100 text-blue-700";
      default: return "bg-emerald-100 text-emerald-700";
    }
  };
  const statusLabel = (s: string) => {
    switch (s) {
      case "expired": return "已到期";
      case "expiring30": return "30天内到期";
      case "expiring90": return "90天内到期";
      case "permanent": return "无固定期限";
      default: return "有效";
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="主合同总数" value={stats.total} color="emerald" sub={`${stats.permanent} 个无固定期限`} />
        <StatCard label="30天内到期" value={stats.expiring30} color="rose" />
        <StatCard label="90天内到期" value={stats.expiring90} color="amber" sub="含30天内" />
        <StatCard label="已到期" value={stats.expired} color="red" />
        <StatCard label="无固定期限" value={stats.permanent} color="blue" />
      </div>

      {/* 公司 + 类型分布 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">合同类型分布</h3>
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
        </div>

        <div className="bg-white rounded-lg shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">公司合同分布</h3>
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
        </div>
      </div>

      {/* 合同预警列表 */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-700">合同到期预警</h3>
          <div className="flex gap-1">
            {(["all", "expiring30", "expiring90", "expired"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded ${
                  filter === f
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f === "all" ? "全部" : f === "expiring30" ? "30天" : f === "expiring90" ? "90天" : "已到期"}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="搜索姓名、工号、公司..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-xs ml-auto px-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-emerald-400"
          />
          <span className="text-xs text-gray-400">{filtered.length} 人</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left py-2 px-2">工号</th>
                <th className="text-left py-2 px-2">姓名</th>
                <th className="text-left py-2 px-2">公司</th>
                <th className="text-left py-2 px-2">合同类型</th>
                <th className="text-left py-2 px-2">最近到期日</th>
                <th className="text-left py-2 px-2">剩余天数</th>
                <th className="text-left py-2 px-2">状态</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((c) => (
                <tr key={c.id} className={`border-b border-gray-50 hover:bg-gray-50 ${
                  c.status === "expired" ? "bg-red-50/40" : c.status === "expiring30" ? "bg-rose-50/30" : ""
                }`}>
                  <td className="py-2 px-2 font-mono text-gray-500">{c.employeeId}</td>
                  <td className="py-2 px-2 font-medium">{c.employeeName}</td>
                  <td className="py-2 px-2 text-gray-500">{c.company || "—"}</td>
                  <td className="py-2 px-2 text-gray-500">{c.contractType || "—"}</td>
                  <td className="py-2 px-2 text-gray-700">{c.nearestEnd || "—"}</td>
                  <td className="py-2 px-2">
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
                  <td className="py-2 px-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge(c.status)}`}>
                      {statusLabel(c.status)}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-center text-gray-400">暂无数据</td></tr>
              )}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p className="text-xs text-gray-400 text-center py-2">还有 {filtered.length - 100} 条，请使用搜索或筛选</p>
          )}
        </div>
      </div>
    </div>
  );
}
