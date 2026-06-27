"use client";

import { PageSurface, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import type { Department, EDP, Position } from "./useAnalyticsData";
import { usePositionData } from "./position/usePositionData";
import { createDeptBarChartBlock } from "./position/DeptBarChart";
import { createPositionTableBlock } from "./position/PositionTable";

export function usePositionAnalyticsBlocks({ positions, edps, departments }: { positions: Position[]; edps: EDP[]; departments: Department[] }): PageSurfaceBlockSpec[] {
  const {
    stats,
    filteredDept,
    l1List,
    filtered,
    search,
    setSearch,
    sortKey,
    sortDesc,
    handleSort,
    sortIcon,
    globalMax,
    filterL1,
    setFilterL1,
  } = usePositionData(positions, edps, departments);

  return [
    {
      kind: "data",
      key: "stats",
      surface: {
        kind: "metrics",
        metrics: [
          { key: "total", label: "岗位总数", value: `${stats.total} / 编制 ${stats.hasHeadcount}` },
          { key: "occupied", label: "有任职", value: `${stats.occupied} (${stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0}%)` },
          { key: "vacant", label: "空岗", value: stats.vacant },
          { key: "overStaffed", label: "超编", value: stats.overStaffed },
          { key: "underStaffed", label: "缺编", value: stats.underStaffed },
        ],
      },
    },
    createDeptBarChartBlock({
      filteredDept,
      l1List,
      filterL1,
      setFilterL1,
      globalMax,
    }),
    createPositionTableBlock({
      filtered,
      search,
      setSearch,
      sortKey,
      sortDesc,
      handleSort,
      sortIcon,
    }),
  ];
}

export default function PositionAnalytics(props: { positions: Position[]; edps: EDP[]; departments: Department[] }) {
  return <PageSurface kind="analysis" blocks={usePositionAnalyticsBlocks(props)} />;
}
