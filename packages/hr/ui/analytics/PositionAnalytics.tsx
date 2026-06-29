"use client";

import { createPageBody, createPageDataSection, PageSurface, type PageSurfaceSectionSpec } from "@workspace/core/ui";
import type { Department, EDP, Position } from "./useAnalyticsData";
import { usePositionData } from "./position/usePositionData";
import { createDeptBarChartSection } from "./position/DeptBarChart";
import { createPositionTableSection } from "./position/PositionTable";

export function usePositionAnalyticsBlocks({ positions, edps, departments }: { positions: Position[]; edps: EDP[]; departments: Department[] }): PageSurfaceSectionSpec[] {
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
    createPageDataSection("stats", {
        kind: "metrics",
        metrics: [
          { key: "total", label: "岗位总数", value: `${stats.total} / 编制 ${stats.hasHeadcount}` },
          { key: "occupied", label: "有任职", value: `${stats.occupied} (${stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0}%)` },
          { key: "vacant", label: "空岗", value: stats.vacant },
          { key: "overStaffed", label: "超编", value: stats.overStaffed },
          { key: "underStaffed", label: "缺编", value: stats.underStaffed },
        ],
      }),
    createDeptBarChartSection({
      filteredDept,
      l1List,
      filterL1,
      setFilterL1,
      globalMax,
    }),
    createPositionTableSection({
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
  return <PageSurface kind="standard" body={createPageBody(usePositionAnalyticsBlocks(props))} />;
}
