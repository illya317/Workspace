"use client";

import { useState } from "react";
import {
  createPageBody, createAnalysisSection,
  createSectionsSection,
  createMetricsSection,
  PageSurface,
  type DataSurfaceColumnSpec,
  type PageSurfaceSectionSpec,
} from "@workspace/core/ui";
import type { EDP, Employee, Employment } from "./useAnalyticsData";
import type { DimKey } from "./employee/constants";
import { DIM_LABELS, featureList } from "./employee/constants";
import { useEmployeeData } from "./employee/useEmployeeData";
import { createCrossMatrixSection } from "./employee/CrossMatrix";

type DistributionRow = {
  label: string;
  count: number;
  percent: string;
};

export function useEmployeeAnalyticsBlocks({ employees, employments, edps }: { employees: Employee[]; employments: Employment[]; edps: EDP[] }): PageSurfaceSectionSpec[] {
  const [feature, setFeature] = useState<DimKey>("gender");
  const [crossRow, setCrossRow] = useState<DimKey>("company");
  const [crossCol, setCrossCol] = useState<DimKey>("gender");

  const { stats, crossMatrix } = useEmployeeData(employees, employments, edps, crossRow, crossCol);
  const recentJoinColumns: DataSurfaceColumnSpec<Employment>[] = [
    { key: "employeeName", label: "姓名", required: true, emphasis: "medium", cell: (row) => row.employeeName },
    { key: "currentCompany", label: "公司", required: true, tone: "muted", cell: (row) => row.currentCompany || "—" },
    { key: "joinDate", label: "入职日期", required: true, tone: "muted", cell: (row) => row.joinDate || "—" },
  ];
  const recentLeaveColumns: DataSurfaceColumnSpec<Employment>[] = [
    { key: "employeeName", label: "姓名", required: true, emphasis: "medium", cell: (row) => row.employeeName },
    { key: "currentCompany", label: "公司", required: true, tone: "muted", cell: (row) => row.currentCompany || "—" },
    { key: "leaveDate", label: "离职日期", required: true, tone: "muted", cell: (row) => row.leaveDate || "—" },
    { key: "leaveReason", label: "原因", required: true, tone: "muted", cell: (row) => row.leaveReason || "—" },
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
    { key: "label", label: DIM_LABELS[feature], required: true, emphasis: "medium", cell: (row) => row.label },
    { key: "count", label: "人数", required: true, align: "right", emphasis: "medium", cell: (row) => row.count },
    { key: "percent", label: "占比", required: true, align: "right", tone: "muted", cell: (row) => row.percent },
  ];

  return [
        createMetricsSection("stats", {
            metrics: [
              { key: "active", label: "在职人数", value: stats.active },
              { key: "joinedThisMonth", label: "本月入职", value: stats.joinedThisMonth },
              { key: "leftThisMonth", label: "本月离职", value: stats.leftThisMonth },
            ],
          }),
        createAnalysisSection("distribution", {
          title: "特征分布",
          toolbar: {
            items: [
              {
                kind: "select",
                key: "feature",
                value: feature,
                onChange: (value) => setFeature(value as DimKey),
                options: featureList.map((item) => ({ value: item, label: `${DIM_LABELS[item]}分布` })),
              },
              { kind: "text", key: "meta", content: <>基于 {stats.active} 位在职员工</> },
            ],
          },
          sections: [{
            key: "distribution-bars",
            body: { kind: "data", data: {
              kind: "table",
              rows: distributionRows,
              columns: distributionColumns,
              visibleColumns: distributionColumns.map((column) => column.key),
              rowKey: (row) => row.label,
                            presentation: { density: "compact" },

              emptyText: "暂无数据",
            } },
          }],
        }),
        createCrossMatrixSection({
          crossMatrix,
          crossRow,
          crossCol,
          statsActive: stats.active,
          featureList,
          setCrossRow,
          setCrossCol,
        }),
        createSectionsSection("recent", {
          layout: "grid",
          sections: [
            createAnalysisSection("recent-joins", {
              title: "最近入职（前10）",
              sections: [{
                key: "recent-joins-table",
                body: { kind: "data", data: {
                  kind: "table",
                  rows: stats.recentJoins,
                  columns: recentJoinColumns,
                  visibleColumns: recentJoinColumns.map((column) => column.key),
                  rowKey: (row) => row.id,
                  emptyText: "暂无数据",
                } },
              }],
            }),
            createAnalysisSection("recent-leaves", {
              title: "最近离职（前10）",
              sections: [{
                key: "recent-leaves-table",
                body: { kind: "data", data: {
                  kind: "table",
                  rows: stats.recentLeaves,
                  columns: recentLeaveColumns,
                  visibleColumns: recentLeaveColumns.map((column) => column.key),
                  rowKey: (row) => row.id,
                  emptyText: "暂无数据",
                } },
              }],
            }),
          ],
        }),
      ];
}

export default function EmployeeAnalytics(props: { employees: Employee[]; employments: Employment[]; edps: EDP[] }) {
  return <PageSurface kind="standard" body={createPageBody(useEmployeeAnalyticsBlocks(props))} />;
}
