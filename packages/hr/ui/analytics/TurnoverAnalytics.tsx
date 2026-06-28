"use client";

import { useMemo, useState } from "react";
import { createPageBody, createAnalysisBlock, createGroupBlock, createPageDataBlock, PageSurface, type DataSurfaceColumnSpec, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import { matchText } from "@workspace/core/search";
import type { Employee, Employment } from "./useAnalyticsData";

type DistributionRow = {
  label: string;
  count: number;
  percent?: string;
};

export function useTurnoverAnalyticsBlocks({ employees: _employees, employments }: { employees: Employee[]; employments: Employment[] }): PageSurfaceBlockSpec[] {
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
  const tenureRows: DistributionRow[] = stats.tenureDist.map(([label, count]) => ({ label, count }));
  const reasonRows: DistributionRow[] = filteredReasons.map(([label, count]) => ({
    label,
    count,
    percent: `${stats.totalLeft > 0 ? Math.round((count / stats.totalLeft) * 100) : 0}%`,
  }));
  const tenureColumns: DataSurfaceColumnSpec<DistributionRow>[] = [
    { key: "label", label: "司龄", required: true, cellClassName: "font-medium text-slate-700", cell: (row) => row.label },
    { key: "count", label: "人数", required: true, cellClassName: "text-right font-medium text-slate-700", cell: (row) => row.count },
  ];
  const reasonColumns: DataSurfaceColumnSpec<DistributionRow>[] = [
    { key: "label", label: "原因", required: true, cellClassName: "font-medium text-slate-700", cell: (row) => row.label },
    { key: "count", label: "人数", required: true, cellClassName: "text-right font-medium text-slate-700", cell: (row) => row.count },
    { key: "percent", label: "占比", required: true, cellClassName: "text-right text-slate-500", cell: (row) => row.percent ?? "0%" },
  ];
  const columns: DataSurfaceColumnSpec<Employment>[] = [
    { key: "employeeName", label: "姓名", required: true, cellClassName: "font-medium", cell: (employment) => employment.employeeName },
    { key: "currentCompany", label: "公司", required: true, cellClassName: "text-slate-500", cell: (employment) => employment.currentCompany || "—" },
    { key: "joinDate", label: "入职日期", required: true, cellClassName: "text-slate-500", cell: (employment) => employment.joinDate || "—" },
    { key: "leaveDate", label: "离职日期", required: true, cellClassName: "text-slate-500", cell: (employment) => employment.leaveDate || "—" },
    { key: "leaveReason", label: "原因", required: true, cellClassName: "text-slate-500", cell: (employment) => employment.leaveReason || "—" },
    { key: "leaveNote", label: "补充说明", required: true, cellClassName: "text-slate-500", cell: (employment) => employment.leaveNote || "—" },
  ];

  return [
        createPageDataBlock("stats", {
            kind: "metrics",
            metrics: [
              { key: "totalLeft", label: "累计离职", value: stats.totalLeft },
              { key: "leftThisMonth", label: "本月离职", value: stats.leftThisMonth },
              { key: "joinedThisMonth", label: "本月入职", value: stats.joinedThisMonth },
              { key: "netChange", label: "本月净变动", value: stats.netChange > 0 ? `+${stats.netChange}` : stats.netChange },
              { key: "turnoverRate", label: "累计离职率", value: `${stats.turnoverRate}%` },
            ],
          }),
        createGroupBlock("charts", {
          layout: "grid",
          blocks: [
            createAnalysisBlock("monthly-trend", {
              title: "离职月度趋势（近12个月）",
              blocks: [{
                kind: "visualization",
                key: "monthly-chart",
                surface: {
                  kind: "chart",
                  visual: {
                    kind: "barChart",
                    height: 160,
                    max: stats.maxMonthCount,
                    emptyText: "暂无数据",
                    bars: stats.monthCounts.map((count, index) => ({
                      key: stats.monthLabels[index],
                      label: stats.monthLabels[index].slice(2),
                      value: count,
                      valueLabel: count || "",
                      tone: "rose",
                      minPercent: count > 0 ? 4 : 1,
                    })),
                  },
                },
              }],
            }),
            createAnalysisBlock("tenure", {
              title: "离职司龄分布",
              blocks: [{
                kind: "data",
                key: "tenure-chart",
                surface: {
                  kind: "table",
                  rows: tenureRows,
                  columns: tenureColumns,
                  visibleColumns: tenureColumns.map((column) => column.key),
                  rowKey: (row) => row.label,
                  density: "compact",
                  emptyText: "暂无数据",
                },
              }],
            }),
          ],
        }),
        createAnalysisBlock("reasons", {
          title: "离职原因分布",
          toolbar: {
            items: [
              { kind: "search", key: "reason-search", value: reasonSearch, onChange: setReasonSearch, placeholder: "搜索原因..." },
              { kind: "text", key: "meta", content: <>{stats.totalLeft} 人</> },
            ],
          },
          blocks: [{
            kind: "data",
            key: "reason-bars",
            surface: {
              kind: "table",
              rows: reasonRows,
              columns: reasonColumns,
              visibleColumns: reasonColumns.map((column) => column.key),
              rowKey: (row) => row.label,
              density: "compact",
              emptyText: "暂无数据",
            },
          }],
        }),
        createAnalysisBlock("recent-leaves", {
          title: "最近离职（前20）",
          blocks: [{
            kind: "data",
            key: "recent-leaves-table",
            surface: {
              kind: "table",
              rows: stats.recentLeaves,
              columns,
              visibleColumns: columns.map((column) => column.key),
              rowKey: (employment) => employment.id,
              emptyText: "暂无数据",
            },
          }],
        }),
      ];
}

export default function TurnoverAnalytics(props: { employees: Employee[]; employments: Employment[] }) {
  return <PageSurface kind="analysis" body={createPageBody(useTurnoverAnalyticsBlocks(props))} />;
}
