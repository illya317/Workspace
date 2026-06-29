"use client";

import { useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { PageSurface, createEmptySection, createMessageSection, createPageBody, createPageTabsNavigation, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { useAnalyticsData } from "./useAnalyticsData";

import { useEmployeeAnalyticsSections } from "./EmployeeAnalytics";
import { useDepartmentAnalyticsSections } from "./DepartmentAnalytics";
import { usePositionAnalyticsSections } from "./PositionAnalytics";
import { useTurnoverAnalyticsSections } from "./TurnoverAnalytics";
import { useContractAnalyticsSections } from "./ContractAnalytics";
import { useHeadcountTrendSections } from "./HeadcountTrend";

type AnalyticsTab = "employee" | "department" | "position" | "turnover" | "contract" | "headcount";

const tabs = getPageViewTabs("/hr/analytics") as { key: AnalyticsTab; label: string }[];

export default function HRAnalyticsClient({ user: _user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("employee");
  const data = useAnalyticsData();
  const employeeSections = useEmployeeAnalyticsSections({
    employees: data.employees,
    employments: data.employments,
    edps: data.edps,
  });
  const departmentSections = useDepartmentAnalyticsSections({
    departments: data.departments,
    edps: data.edps,
  });
  const positionSections = usePositionAnalyticsSections({
    positions: data.positions,
    edps: data.edps,
    departments: data.departments,
  });
  const turnoverSections = useTurnoverAnalyticsSections({
    employees: data.employees,
    employments: data.employments,
  });
  const contractSections = useContractAnalyticsSections({ contracts: data.contracts });
  const headcountSections = useHeadcountTrendSections({ employments: data.employments });

  const tabSections: Record<AnalyticsTab, BodySurfaceSectionSpec[]> = {
    employee: employeeSections,
    department: departmentSections,
    position: positionSections,
    turnover: turnoverSections,
    contract: contractSections,
    headcount: headcountSections,
  };
  let sections: BodySurfaceSectionSpec[];
  if (data.loading) {
    sections = [createEmptySection("loading", { content: "数据加载中..." })];
  } else if (data.error) {
    sections = [createMessageSection("error", { tone: "danger" as const, content: data.error })];
  } else {
    sections = tabSections[activeTab];
  }

  return (
    <PageSurface kind="standard"
	      navigation={createPageTabsNavigation({
	        items: tabs,
	        active: activeTab,
	        onChange: (k: string) => setActiveTab(k as AnalyticsTab),
	      })}
	      body={createPageBody(sections)}
	    />
  );
}
