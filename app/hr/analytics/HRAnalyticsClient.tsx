"use client";

import { useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { useAnalyticsData } from "./useAnalyticsData";
import { EmptyStateCard, PageContent, TabBar } from "@workspace/core/ui";

import EmployeeAnalytics from "./EmployeeAnalytics";
import DepartmentAnalytics from "./DepartmentAnalytics";
import PositionAnalytics from "./PositionAnalytics";
import TurnoverAnalytics from "./TurnoverAnalytics";
import ContractAnalytics from "./ContractAnalytics";
import HeadcountTrend from "./HeadcountTrend";

type AnalyticsTab = "employee" | "department" | "position" | "turnover" | "contract" | "headcount";

const tabs: { key: AnalyticsTab; label: string; desc: string }[] = [
  { key: "employee", label: "员工信息", desc: "员工分布与统计" },
  { key: "department", label: "部门架构", desc: "部门层级与编制" },
  { key: "position", label: "岗位分析", desc: "岗位配置与空岗" },
  { key: "contract", label: "合同预警", desc: "合同到期提醒" },
  { key: "headcount", label: "人员流动", desc: "入职离职趋势" },
  { key: "turnover", label: "离职分析", desc: "离职率与原因" },
];

export default function HRAnalyticsClient({ user: _user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("employee");
  const data = useAnalyticsData();

  return (
      <PageContent className="max-w-5xl">
        {/* Tabs */}
        <TabBar tabs={tabs} active={activeTab} onChange={(k) => setActiveTab(k as AnalyticsTab)} />

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
      </PageContent>
  );
}
