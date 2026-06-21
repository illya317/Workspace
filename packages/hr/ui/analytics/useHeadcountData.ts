"use client";

import { useMemo } from "react";
import type { Employment } from "./useAnalyticsData";

export interface MonthlySnapshot {
  label: string;
  joins: number;
  leaves: number;
  net: number;
  active: number;
}

export function useHeadcountData(employments: Employment[]) {
  return useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();

    const active = employments.filter((e) => e.isActive);

    // 月度流入流出（近12个月）
    const months: MonthlySnapshot[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const year = d.getFullYear();
      const month = d.getMonth();
      const joins = employments.filter((e) => {
        if (!e.joinDate) return false;
        const jd = new Date(e.joinDate);
        return jd.getFullYear() === year && jd.getMonth() === month;
      }).length;
      const leaves = employments.filter((e) => {
        if (!e.leaveDate) return false;
        const ld = new Date(e.leaveDate);
        return ld.getFullYear() === year && ld.getMonth() === month;
      }).length;
      months.push({ label, joins, leaves, net: joins - leaves, active: 0 });
    }

    // 每月在职推算
    for (let i = 0; i < months.length; i++) {
      const ci = 11 - i;
      const endOfMonth = new Date(thisYear, thisMonth - ci + 1, 0);
      months[i].active = employments.filter((e) => {
        if (!e.joinDate) return false;
        const jd = new Date(e.joinDate);
        if (jd > endOfMonth) return false;
        if (!e.isActive && e.leaveDate) {
          const ld = new Date(e.leaveDate);
          if (ld <= endOfMonth) return false;
        }
        return true;
      }).length;
    }

    const maxFlow = Math.max(...months.map((m) => Math.max(m.joins, m.leaves)), 1);
    const activeRange = {
      min: Math.min(...months.map((m) => m.active)),
      max: Math.max(...months.map((m) => m.active)),
    };

    // 年度汇总
    const yearJoins = months.reduce((s, m) => s + m.joins, 0);
    const yearLeaves = months.reduce((s, m) => s + m.leaves, 0);

    // 公司分布（当前在职）
    const companyMap = new Map<string, number>();
    active.forEach((e) => {
      const c = e.currentCompany || "未知";
      companyMap.set(c, (companyMap.get(c) || 0) + 1);
    });

    return {
      months,
      maxFlow,
      activeRange,
      thisMonthJoins: months[11].joins,
      thisMonthLeaves: months[11].leaves,
      thisMonthNet: months[11].net,
      yearJoins,
      yearLeaves,
      yearNet: yearJoins - yearLeaves,
      currentActive: active.length,
      companies: [...companyMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [employments]);
}
