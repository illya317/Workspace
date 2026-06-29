"use client";

import { useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { PageSurface, createPageTabsNavigation } from "@workspace/core/ui";

type PerfTab = "attendance" | "works" | "performance";

const tabs = getPageViewTabs("/hr/performance") as { key: PerfTab; label: string }[];

export default function HRPerformanceClient({ user: _user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeTab, setActiveTab] = useState<PerfTab>("attendance");
  const contentByTab: Record<PerfTab, string> = {
    attendance: "考勤模块开发中...",
    works: "工作查看模块开发中...",
    performance: "绩效模块开发中...",
  };

  return (
    <PageSurface kind="standard"
	      navigation={createPageTabsNavigation({
	        items: tabs,
	        active: activeTab,
	        onChange: (k: string) => setActiveTab(k as PerfTab),
	      })}
	      body={{ kind: "section", empty: { content: contentByTab[activeTab] } }}
	    />
  );
}
