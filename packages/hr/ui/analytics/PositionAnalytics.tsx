"use client";

import { MetricCard } from "@workspace/core/ui";
import type { Department, EDP, Position } from "./useAnalyticsData";
import { usePositionData } from "./position/usePositionData";
import DeptBarChart from "./position/DeptBarChart";
import PositionTable from "./position/PositionTable";

export default function PositionAnalytics({ positions, edps, departments }: { positions: Position[]; edps: EDP[]; departments: Department[] }) {
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

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard label="岗位总数" value={`${stats.total} / 编制 ${stats.hasHeadcount}`} />
        <MetricCard label="有任职" value={`${stats.occupied} (${stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0}%)`} />
        <MetricCard label="空岗" value={stats.vacant} />
        <MetricCard label="超编" value={stats.overStaffed} />
        <MetricCard label="缺编" value={stats.underStaffed} />
      </div>

      {/* 部门编制对比 — 按层级分组 */}
      <DeptBarChart
        filteredDept={filteredDept}
        l1List={l1List}
        filterL1={filterL1}
        setFilterL1={setFilterL1}
        globalMax={globalMax}
      />

      {/* Position table */}
      <PositionTable
        filtered={filtered}
        search={search}
        setSearch={setSearch}
        sortKey={sortKey}
        sortDesc={sortDesc}
        handleSort={handleSort}
        sortIcon={sortIcon}
      />
    </div>
  );
}
