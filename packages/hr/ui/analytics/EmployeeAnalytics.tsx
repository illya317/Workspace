"use client";

import { useState } from "react";
import {
  PageSurface,
  type DataSurfaceColumnSpec,
  type PageSurfaceBlockSpec,
} from "@workspace/core/ui";
import type { EDP, Employee, Employment } from "./useAnalyticsData";
import type { DimKey } from "./employee/constants";
import { DIM_LABELS, featureList } from "./employee/constants";
import { useEmployeeData } from "./employee/useEmployeeData";
import { createCrossMatrixBlock } from "./employee/CrossMatrix";

type DistributionRow = {
  label: string;
  count: number;
  percent: string;
};

export function useEmployeeAnalyticsBlocks({ employees, employments, edps }: { employees: Employee[]; employments: Employment[]; edps: EDP[] }): PageSurfaceBlockSpec[] {
  const [feature, setFeature] = useState<DimKey>("gender");
  const [crossRow, setCrossRow] = useState<DimKey>("company");
  const [crossCol, setCrossCol] = useState<DimKey>("gender");

  const { stats, crossMatrix } = useEmployeeData(employees, employments, edps, crossRow, crossCol);
  const recentJoinColumns: DataSurfaceColumnSpec<Employment>[] = [
    { key: "employeeName", label: "姓名", required: true, cellClassName: "font-medium", cell: (row) => row.employeeName },
    { key: "currentCompany", label: "公司", required: true, cellClassName: "text-slate-500", cell: (row) => row.currentCompany || "—" },
    { key: "joinDate", label: "入职日期", required: true, cellClassName: "text-slate-500", cell: (row) => row.joinDate || "—" },
  ];
  const recentLeaveColumns: DataSurfaceColumnSpec<Employment>[] = [
    { key: "employeeName", label: "姓名", required: true, cellClassName: "font-medium", cell: (row) => row.employeeName },
    { key: "currentCompany", label: "公司", required: true, cellClassName: "text-slate-500", cell: (row) => row.currentCompany || "—" },
    { key: "leaveDate", label: "离职日期", required: true, cellClassName: "text-slate-500", cell: (row) => row.leaveDate || "—" },
    { key: "leaveReason", label: "原因", required: true, cellClassName: "text-slate-500", cell: (row) => row.leaveReason || "—" },
  ];

  function currentDist(): [string, number][] {
    if (feature in stats.distributions) return (stats.distributions as Record<DimKey, [string, number][]>)[feature] || [];
    return [];
  }
  const distributionRows: DistributionRow[] = currentDist().map(([label, count]) => ({
    label,
    count,
    percent: `${stats.active > 0 ? Math.round((count / stats.active) * 100) : 0}%`,
  }));
  const distributionColumns: DataSurfaceColumnSpec<DistributionRow>[] = [
    { key: "label", label: DIM_LABELS[feature], required: true, cellClassName: "font-medium text-slate-700", cell: (row) => row.label },
    { key: "count", label: "人数", required: true, cellClassName: "text-right font-medium text-slate-700", cell: (row) => row.count },
    { key: "percent", label: "占比", required: true, cellClassName: "text-right text-slate-500", cell: (row) => row.percent },
  ];

  return [
        {
          kind: "data",
          key: "stats",
          surface: {
            kind: "metrics",
            metrics: [
              { key: "total", label: "员工总数", value: stats.total },
              { key: "active", label: "在职人数", value: stats.active },
              { key: "inactive", label: "离职人数", value: stats.inactive },
              { key: "joinedThisMonth", label: "本月入职", value: stats.joinedThisMonth },
              { key: "leftThisMonth", label: "本月离职", value: stats.leftThisMonth },
            ],
          },
        },
        {
          kind: "analysis",
          key: "distribution",
          title: "特征分布",
          toolbar: {
            items: [
              {
                kind: "select",
                key: "feature",
                value: feature,
                onChange: (value) => setFeature(value as DimKey),
                options: featureList.map((item) => ({ value: item, label: `${DIM_LABELS[item]}分布` })),
                triggerClassName: "!min-h-8 !w-32",
              },
              { kind: "text", key: "meta", content: <>基于 {stats.active} 位在职员工</> },
            ],
          },
          blocks: [{
            kind: "data",
            key: "distribution-bars",
            surface: {
              kind: "table",
              rows: distributionRows,
              columns: distributionColumns,
              visibleColumns: distributionColumns.map((column) => column.key),
              rowKey: (row) => row.label,
              density: "compact",
              emptyText: "暂无数据",
            },
          }],
        },
        createCrossMatrixBlock({
          crossMatrix,
          crossRow,
          crossCol,
          statsActive: stats.active,
          featureList,
          setCrossRow,
          setCrossCol,
        }),
        {
          kind: "surfaceGroup",
          key: "recent",
          layout: "grid",
          blocks: [
            {
              kind: "analysis",
              key: "recent-joins",
              title: "最近入职（前10）",
              blocks: [{
                kind: "data",
                key: "recent-joins-table",
                surface: {
                  kind: "table",
                  rows: stats.recentJoins,
                  columns: recentJoinColumns,
                  visibleColumns: recentJoinColumns.map((column) => column.key),
                  rowKey: (row) => row.id,
                  emptyText: "暂无数据",
                },
              }],
            },
            {
              kind: "analysis",
              key: "recent-leaves",
              title: "最近离职（前10）",
              blocks: [{
                kind: "data",
                key: "recent-leaves-table",
                surface: {
                  kind: "table",
                  rows: stats.recentLeaves,
                  columns: recentLeaveColumns,
                  visibleColumns: recentLeaveColumns.map((column) => column.key),
                  rowKey: (row) => row.id,
                  emptyText: "暂无数据",
                },
              }],
            },
          ],
        },
      ];
}

export default function EmployeeAnalytics(props: { employees: Employee[]; employments: Employment[]; edps: EDP[] }) {
  return <PageSurface kind="analysis" blocks={useEmployeeAnalyticsBlocks(props)} />;
}
