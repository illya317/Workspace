"use client";

import { useState } from "react";
import { AnalysisBlock, SelectField } from "@workspace/core/ui";
import type { Employee, Employment, EDP } from "./useAnalyticsData";
import StatCard from "./shared/StatCard";
import type { DimKey } from "./employee/constants";
import { DIM_LABELS, DIM_COLORS, featureList } from "./employee/constants";
import { useEmployeeData } from "./employee/useEmployeeData";
import CrossMatrix from "./employee/CrossMatrix";

function DistributionBar({ label, count, total, color = "bg-emerald-500" }: { label: string; count: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0 text-xs text-gray-600 truncate">{label}</span>
      <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
        <div className={`h-full ${color} rounded transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs text-gray-700 font-medium">{count}</span>
      <span className="w-10 text-right text-xs text-gray-400">{pct}%</span>
    </div>
  );
}

export default function EmployeeAnalytics({ employees, employments, edps }: { employees: Employee[]; employments: Employment[]; edps: EDP[] }) {
  const [feature, setFeature] = useState<DimKey>("gender");
  const [crossRow, setCrossRow] = useState<DimKey>("company");
  const [crossCol, setCrossCol] = useState<DimKey>("gender");

  const { stats, crossMatrix } = useEmployeeData(employees, employments, edps, crossRow, crossCol);

  function currentDist(): [string, number][] {
    if (feature in stats.distributions) return (stats.distributions as Record<DimKey, [string, number][]>)[feature] || [];
    return [];
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="员工总数" value={stats.total} color="emerald" />
        <StatCard label="在职人数" value={stats.active} color="blue" />
        <StatCard label="离职人数" value={stats.inactive} color="rose" />
        <StatCard label="本月入职" value={stats.joinedThisMonth} color="amber" />
        <StatCard label="本月离职" value={stats.leftThisMonth} color="purple" />
      </div>

      {/* 单维度特征分布 */}
      <AnalysisBlock
        title="特征分布"
        toolbar={
          <div className="flex flex-wrap items-center gap-4">
          <SelectField
            value={feature}
            onChange={(value) => setFeature(value as DimKey)}
            options={featureList.map((item) => ({ value: item, label: `${DIM_LABELS[item]}分布` }))}
            selectClassName="min-h-8 w-32"
          />
          <span className="text-xs text-gray-400">基于 {stats.active} 位在职员工</span>
          </div>
        }
      >

        {currentDist().map(([k, v]) => (
          <DistributionBar key={k} label={k} count={v} total={stats.active} color={DIM_COLORS[feature] || "bg-emerald-400"} />
        ))}
      </AnalysisBlock>

      {/* 交叉分析 */}
      <CrossMatrix
        crossMatrix={crossMatrix}
        crossRow={crossRow}
        crossCol={crossCol}
        statsActive={stats.active}
        featureList={featureList}
        setCrossRow={setCrossRow}
        setCrossCol={setCrossCol}
      />

      {/* Recent changes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalysisBlock title="最近入职（前10）">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">公司</th>
                <th className="px-4 py-3 font-medium">入职日期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {stats.recentJoins.map((e) => (
                <tr key={e.id} className="hover:bg-emerald-50/20">
                  <td className="px-4 py-3 font-medium">{e.employeeName}</td>
                  <td className="px-4 py-3 text-slate-500">{e.currentCompany || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{e.joinDate}</td>
                </tr>
              ))}
              {stats.recentJoins.length === 0 && (
                <tr><td colSpan={3} className="py-8 text-center text-gray-400">暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </AnalysisBlock>

        <AnalysisBlock title="最近离职（前10）">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">公司</th>
                <th className="px-4 py-3 font-medium">离职日期</th>
                <th className="px-4 py-3 font-medium">原因</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {stats.recentLeaves.map((e) => (
                <tr key={e.id} className="hover:bg-emerald-50/20">
                  <td className="px-4 py-3 font-medium">{e.employeeName}</td>
                  <td className="px-4 py-3 text-slate-500">{e.currentCompany || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{e.leaveDate}</td>
                  <td className="px-4 py-3 text-slate-500">{e.leaveReason || "—"}</td>
                </tr>
              ))}
              {stats.recentLeaves.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400">暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </AnalysisBlock>
      </div>
    </div>
  );
}
