"use client";

import { useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { PageSurface, createEmptyBlock, createMessageBlock, createPageBody, createPageTabsNavigation, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import { useAnalyticsData } from "./useAnalyticsData";

import { useEmployeeAnalyticsBlocks } from "./EmployeeAnalytics";
import { useDepartmentAnalyticsBlocks } from "./DepartmentAnalytics";
import { usePositionAnalyticsBlocks } from "./PositionAnalytics";
import { useTurnoverAnalyticsBlocks } from "./TurnoverAnalytics";
import { useContractAnalyticsBlocks } from "./ContractAnalytics";
import { useHeadcountTrendBlocks } from "./HeadcountTrend";

type AnalyticsTab = "employee" | "department" | "position" | "turnover" | "contract" | "headcount";

const tabs = getPageViewTabs("/hr/analytics") as { key: AnalyticsTab; label: string }[];

export default function HRAnalyticsClient({ user: _user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("employee");
  const data = useAnalyticsData();
  const employeeBlocks = useEmployeeAnalyticsBlocks({
    employees: data.employees,
    employments: data.employments,
    edps: data.edps,
  });
  const departmentBlocks = useDepartmentAnalyticsBlocks({
    departments: data.departments,
    edps: data.edps,
  });
  const positionBlocks = usePositionAnalyticsBlocks({
    positions: data.positions,
    edps: data.edps,
    departments: data.departments,
  });
  const turnoverBlocks = useTurnoverAnalyticsBlocks({
    employees: data.employees,
    employments: data.employments,
  });
  const contractBlocks = useContractAnalyticsBlocks({ contracts: data.contracts });
  const headcountBlocks = useHeadcountTrendBlocks({ employments: data.employments });

  const tabBlocks: Record<AnalyticsTab, PageSurfaceBlockSpec[]> = {
    employee: employeeBlocks,
    department: departmentBlocks,
    position: positionBlocks,
    turnover: turnoverBlocks,
    contract: contractBlocks,
    headcount: headcountBlocks,
  };
  let blocks: PageSurfaceBlockSpec[];
  if (data.loading) {
    blocks = [createEmptyBlock("loading", { content: "数据加载中..." })];
  } else if (data.error) {
    blocks = [createMessageBlock("error", { tone: "danger" as const, content: data.error })];
  } else {
    blocks = tabBlocks[activeTab];
  }

  return (
    <PageSurface
	      kind="analysis"
	      navigation={createPageTabsNavigation({
	        items: tabs,
	        active: activeTab,
	        onChange: (k: string) => setActiveTab(k as AnalyticsTab),
	      })}
	      contentClassName="max-w-5xl"
	      body={createPageBody(blocks)}
	    />
  );
}
