"use client";

import { useMemo, useState } from "react";
import { AnalysisBlock, DataTable, MetricCard, type DataTableColumn } from "@workspace/core/ui";
import { matchText } from "@workspace/core/search";
import type { Employee, Employment } from "./useAnalyticsData";

export default function TurnoverAnalytics({ employees: _employees, employments }: { employees: Employee[]; employments: Employment[] }) {
  const [reasonSearch, setReasonSearch] = useState("");

  const stats = useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();

    const left = employments.filter((e) => !e.isActive && e.leaveDate);
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
    return stats.reasons.filter(([r]) => matchText(r, reasonSearch));
  }, [stats.reasons, reasonSearch]);
  const columns: DataTableColumn<Employment>[] = [
    { key: "employeeName", label: "姓名", required: true, cellClassName: "font-medium", render: (employment) => employment.employeeName },
    { key: "currentCompany", label: "公司", required: true, cellClassName: "text-slate-500", render: (employment) => employment.currentCompany || "—" },
    { key: "joinDate", label: "入职日期", required: true, cellClassName: "text-slate-500", render: (employment) => employment.joinDate || "—" },
    { key: "leaveDate", label: "离职日期", required: true, cellClassName: "text-slate-500", render: (employment) => employment.leaveDate || "—" },
    { key: "leaveReason", label: "原因", required: true, cellClassName: "text-slate-500", render: (employment) => employment.leaveReason || "—" },
    { key: "leaveNote", label: "补充说明", required: true, cellClassName: "text-slate-500", render: (employment) => employment.leaveNote || "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard label="累计离职" value={stats.totalLeft} />
        <MetricCard label="本月离职" value={stats.leftThisMonth} />
        <MetricCard label="本月入职" value={stats.joinedThisMonth} />
        <MetricCard label="本月净变动" value={stats.netChange > 0 ? `+${stats.netChange}` : stats.netChange} />
        <MetricCard label="累计离职率" value={`${stats.turnoverRate}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalysisBlock title="离职月度趋势（近12个月）">
          <div className="flex items-end gap-1 h-40">
            {stats.monthCounts.map((c, i) => {
              const h = Math.round((c / stats.maxMonthCount) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500 font-medium">{c || ""}</span>
                  <div
                    className="w-full bg-rose-400 rounded-t"
                    style={{ height: `${Math.max(h, c > 0 ? 4 : 1)}%` }}
                  />
                  <span className="text-[9px] text-gray-400 whitespace-nowrap">{stats.monthLabels[i].slice(2)}</span>
                </div>
              );
            })}
          </div>
        </AnalysisBlock>

        <AnalysisBlock title="离职司龄分布">
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
        </AnalysisBlock>
      </div>

      <AnalysisBlock
        title="离职原因分布"
        toolbarItems={[
          { kind: "search", key: "reason-search", value: reasonSearch, onChange: setReasonSearch, placeholder: "搜索原因...", className: "max-w-xs" },
          { kind: "text", key: "meta", content: <>{stats.totalLeft} 人</> },
        ]}
      >
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
                <span className="w-8 text-right text-xs text-gray-400">{pct}%</span>
              </div>
            );
          })}
        </div>
      </AnalysisBlock>

      <AnalysisBlock title="最近离职（前20）">
        <DataTable
          rows={stats.recentLeaves}
          columns={columns}
          visibleColumns={columns.map((column) => column.key)}
          rowKey={(employment) => employment.id}
          emptyText="暂无数据"
        />
      </AnalysisBlock>
    </div>
  );
}
