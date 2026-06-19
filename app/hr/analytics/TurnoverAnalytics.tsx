"use client";

import { useMemo, useState } from "react";
import type { Employee, Employment } from "./useAnalyticsData";
import StatCard from "./shared/StatCard";

export default function TurnoverAnalytics({ employees: _employees, employments }: { employees: Employee[]; employments: Employment[] }) {
  const [reasonSearch, setReasonSearch] = useState("");

  const stats = useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();

    // 已离职记录
    const left = employments.filter((e) => !e.isActive && e.leaveDate);

    // 离职总数
    const totalLeft = left.length;

    // 本月离职
    const leftThisMonth = left.filter((e) => {
      const d = new Date(e.leaveDate!);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    }).length;

    // 本月入职
    const joinedThisMonth = employments.filter((e) => {
      if (!e.joinDate) return false;
      const d = new Date(e.joinDate);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    }).length;

    // 净变动
    const netChange = joinedThisMonth - leftThisMonth;

    // 年度离职率（离职人数 / (年初在职 + 年度入职) 简化版 = 离职/总记录数）
    // 更合理：当年离职 / 当年平均在职
    const activeNow = employments.filter((e) => e.isActive).length;
    const turnoverRate = activeNow + totalLeft > 0 ? Math.round((totalLeft / (activeNow + totalLeft)) * 100) : 0;

    // 离职原因分布
    const reasonMap = new Map<string, number>();
    left.forEach((e) => {
      const r = e.leaveReason || "未填写";
      reasonMap.set(r, (reasonMap.get(r) || 0) + 1);
    });
    const reasons = [...reasonMap.entries()].sort((a, b) => b[1] - a[1]);

    // 离职月份趋势（最近12个月）
    const monthLabels: string[] = [];
    const monthCounts: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      monthLabels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      monthCounts.push(0);
    }
    left.forEach((e) => {
      const ld = new Date(e.leaveDate!);
      const idx = monthLabels.findIndex((m) => {
        const [y, mo] = m.split("-").map(Number);
        return y === ld.getFullYear() && mo === ld.getMonth() + 1;
      });
      if (idx >= 0) monthCounts[idx]++;
    });
    const maxMonthCount = Math.max(...monthCounts, 1);

    // 司龄分布（离职时）
    const tenureMap = new Map<string, number>();
    left.forEach((e) => {
      if (!e.joinDate) { tenureMap.set("未知", (tenureMap.get("未知") || 0) + 1); return; }
      const join = new Date(e.joinDate);
      const leave = new Date(e.leaveDate!);
      const years = leave.getFullYear() - join.getFullYear();
      let g = "";
      if (years < 1) g = "<1年";
      else if (years < 3) g = "1-3年";
      else if (years < 5) g = "3-5年";
      else if (years < 10) g = "5-10年";
      else g = "≥10年";
      tenureMap.set(g, (tenureMap.get(g) || 0) + 1);
    });
    const tenureOrder = ["<1年", "1-3年", "3-5年", "5-10年", "≥10年", "未知"];
    const tenureDist = tenureOrder.map((k) => [k, tenureMap.get(k) || 0] as [string, number]).filter(([, v]) => v > 0);

    // 最近离职列表
    const recentLeaves = left
      .sort((a, b) => new Date(b.leaveDate!).getTime() - new Date(a.leaveDate!).getTime())
      .slice(0, 20);

    return {
      totalLeft, leftThisMonth, joinedThisMonth, netChange, turnoverRate,
      reasons, monthLabels, monthCounts, maxMonthCount,
      tenureDist, recentLeaves,
    };
  }, [employments]);

  const filteredReasons = useMemo(() => {
    if (!reasonSearch.trim()) return stats.reasons;
    const q = reasonSearch.toLowerCase();
    return stats.reasons.filter(([r]) => r.toLowerCase().includes(q));
  }, [stats.reasons, reasonSearch]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="累计离职" value={stats.totalLeft} color="rose" />
        <StatCard label="本月离职" value={stats.leftThisMonth} color="amber" />
        <StatCard label="本月入职" value={stats.joinedThisMonth} color="blue" />
        <StatCard label="本月净变动" value={stats.netChange > 0 ? `+${stats.netChange}` : stats.netChange} color={stats.netChange >= 0 ? "emerald" : "rose"} />
        <StatCard label="累计离职率" value={`${stats.turnoverRate}%`} color="purple" sub="离职/（在职+离职）" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">离职月度趋势（近12个月）</h3>
          <div className="flex items-end gap-1 h-40">
            {stats.monthCounts.map((c, i) => {
              const h = Math.round((c / stats.maxMonthCount) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500 font-medium">{c || ""}</span>
                  <div
                    className="w-full bg-rose-400 rounded-t"
                    style={{ height: `${Math.max(h, c > 0 ? 4 : 1)}%` }}
                  />
                  <span className="text-[9px] text-gray-400 whitespace-nowrap">{stats.monthLabels[i].slice(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">离职司龄分布</h3>
          <div className="space-y-2">
            {stats.tenureDist.map(([k, v]) => {
              const max = Math.max(...stats.tenureDist.map(([, x]) => x), 1);
              const pct = Math.round((v / max) * 100);
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-16 text-xs text-gray-600">{k}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-amber-400 rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-gray-700">{v}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">离职原因分布</h3>
          <input
            type="text"
            placeholder="搜索原因..."
            value={reasonSearch}
            onChange={(e) => setReasonSearch(e.target.value)}
            className="flex-1 max-w-xs px-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-emerald-400"
          />
          <span className="text-xs text-gray-400">{stats.totalLeft} 人</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          {filteredReasons.map(([k, v]) => {
            const max = Math.max(...filteredReasons.map(([, x]) => x), 1);
            const pct = Math.round((v / stats.totalLeft) * 100);
            const barPct = Math.round((v / max) * 100);
            return (
              <div key={k} className="flex items-center gap-3 py-1">
                <span className="w-24 shrink-0 text-xs text-gray-600 truncate" title={k}>{k}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-rose-300 rounded" style={{ width: `${barPct}%` }} />
                </div>
                <span className="w-8 text-right text-xs font-medium text-gray-700">{v}</span>
                <span className="w-8 text-right text-[10px] text-gray-400">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">最近离职（前20）</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left py-2 px-2">姓名</th>
                <th className="text-left py-2 px-2">公司</th>
                <th className="text-left py-2 px-2">入职日期</th>
                <th className="text-left py-2 px-2">离职日期</th>
                <th className="text-left py-2 px-2">原因</th>
                <th className="text-left py-2 px-2">补充说明</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentLeaves.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium">{e.employeeName}</td>
                  <td className="py-2 px-2 text-gray-500">{e.currentCompany || "—"}</td>
                  <td className="py-2 px-2 text-gray-500">{e.joinDate || "—"}</td>
                  <td className="py-2 px-2 text-gray-500">{e.leaveDate}</td>
                  <td className="py-2 px-2 text-gray-500">{e.leaveReason || "—"}</td>
                  <td className="py-2 px-2 text-gray-500">{e.leaveNote || "—"}</td>
                </tr>
              ))}
              {stats.recentLeaves.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-gray-400">暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
