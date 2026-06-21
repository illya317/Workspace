"use client";

import { useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { AnalysisPageFrame } from "@workspace/core/ui";
import { useAnalyticsData } from "./useAnalyticsData";
import { EmptyStateCard } from "@workspace/core/ui";

import EmployeeAnalytics from "./EmployeeAnalytics";
import DepartmentAnalytics from "./DepartmentAnalytics";
import PositionAnalytics from "./PositionAnalytics";
import TurnoverAnalytics from "./TurnoverAnalytics";
import ContractAnalytics from "./ContractAnalytics";
import HeadcountTrend from "./HeadcountTrend";

type AnalyticsTab = "employee" | "department" | "position" | "turnover" | "contract" | "headcount";

const tabs = getPageViewTabs("/hr/analytics") as { key: AnalyticsTab; label: string }[];

export default function HRAnalyticsClient({ user: _user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("employee");
  const data = useAnalyticsData();

  return (
      <AnalysisPageFrame
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(k) => setActiveTab(k as AnalyticsTab)}
        contentClassName="max-w-5xl"
      >
        {/* Data loading state */}
        {data.loading && (
          <EmptyStateCard>数据加载中...</EmptyStateCard>
        )}
        {data.error && (
          <EmptyStateCard className="text-red-500">{data.error}</EmptyStateCard>
        )}

        {/* Tab contents */}
        {!data.loading && !data.error && (
          <>
            {activeTab === "employee" && (
              <EmployeeAnalytics employees={data.employees} employments={data.employments} edps={data.edps} />
            )}
            {activeTab === "department" && (
              <DepartmentAnalytics departments={data.departments} edps={data.edps} />
            )}
            {activeTab === "position" && (
              <PositionAnalytics positions={data.positions} edps={data.edps} departments={data.departments} />
            )}
            {activeTab === "turnover" && (
              <TurnoverAnalytics employees={data.employees} employments={data.employments} />
            )}
            {activeTab === "contract" && (
              <ContractAnalytics contracts={data.contracts} />
            )}
            {activeTab === "headcount" && (
              <HeadcountTrend employments={data.employments} />
            )}
          </>
        )}
      </AnalysisPageFrame>
  );
}
