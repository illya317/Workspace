"use client";

import type { Position, EDP, Department } from "./useAnalyticsData";
import StatCard from "./shared/StatCard";
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
        <StatCard label="岗位总数" value={stats.total} color="emerald" sub={`${stats.hasHeadcount} 个有编制`} />
        <StatCard label="有任职" value={stats.occupied} color="blue" sub={`占比 ${stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0}%`} />
        <StatCard label="空岗" value={stats.vacant} color="amber" />
        <StatCard label="超编" value={stats.overStaffed} color="rose" sub="实际 > 编制" />
        <StatCard label="缺编" value={stats.underStaffed} color="purple" sub="实际 < 编制" />
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
