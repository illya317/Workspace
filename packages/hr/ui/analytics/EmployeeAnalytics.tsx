"use client";

import { useState } from "react";
import {
  AnalysisBlock,
  DataTable,
  MetricCard,
  SelectField,
  type DataTableColumn,
} from "@workspace/core/ui";
import type { EDP, Employee, Employment } from "./useAnalyticsData";
import type { DimKey } from "./employee/constants";
import { DIM_COLORS, DIM_LABELS, featureList } from "./employee/constants";
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
  const recentJoinColumns: DataTableColumn<Employment>[] = [
    { key: "employeeName", label: "姓名", required: true, cellClassName: "font-medium", render: (row) => row.employeeName },
    { key: "currentCompany", label: "公司", required: true, cellClassName: "text-slate-500", render: (row) => row.currentCompany || "—" },
    { key: "joinDate", label: "入职日期", required: true, cellClassName: "text-slate-500", render: (row) => row.joinDate || "—" },
  ];
  const recentLeaveColumns: DataTableColumn<Employment>[] = [
    { key: "employeeName", label: "姓名", required: true, cellClassName: "font-medium", render: (row) => row.employeeName },
    { key: "currentCompany", label: "公司", required: true, cellClassName: "text-slate-500", render: (row) => row.currentCompany || "—" },
    { key: "leaveDate", label: "离职日期", required: true, cellClassName: "text-slate-500", render: (row) => row.leaveDate || "—" },
    { key: "leaveReason", label: "原因", required: true, cellClassName: "text-slate-500", render: (row) => row.leaveReason || "—" },
  ];

  function currentDist(): [string, number][] {
    if (feature in stats.distributions) return (stats.distributions as Record<DimKey, [string, number][]>)[feature] || [];
    return [];
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard label="员工总数" value={stats.total} />
        <MetricCard label="在职人数" value={stats.active} />
        <MetricCard label="离职人数" value={stats.inactive} />
        <MetricCard label="本月入职" value={stats.joinedThisMonth} />
        <MetricCard label="本月离职" value={stats.leftThisMonth} />
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
            triggerClassName="min-h-8 w-32"
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
          <DataTable
            rows={stats.recentJoins}
            columns={recentJoinColumns}
            visibleColumns={recentJoinColumns.map((column) => column.key)}
            rowKey={(row) => row.id}
            emptyText="暂无数据"
          />
        </AnalysisBlock>

        <AnalysisBlock title="最近离职（前10）">
          <DataTable
            rows={stats.recentLeaves}
            columns={recentLeaveColumns}
            visibleColumns={recentLeaveColumns.map((column) => column.key)}
            rowKey={(row) => row.id}
            emptyText="暂无数据"
          />
        </AnalysisBlock>
      </div>
    </div>
  );
}
