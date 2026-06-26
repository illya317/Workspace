"use client";

import { useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { PageSurface, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import { useAnalyticsData } from "./useAnalyticsData";

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
  const blocks: PageSurfaceBlockSpec[] = [];

  if (data.loading) {
    blocks.push({ kind: "empty" as const, key: "loading", content: "数据加载中..." });
  } else if (data.error) {
    blocks.push({ kind: "message" as const, key: "error", tone: "danger" as const, content: data.error });
  } else {
    blocks.push({
      kind: "moduleView" as const,
      key: activeTab,
      view: (
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
      ),
    });
  }

  return (
    <PageSurface
      kind="analysis"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(k) => setActiveTab(k as AnalyticsTab)}
      contentClassName="max-w-5xl"
      blocks={blocks}
    />
  );
}
