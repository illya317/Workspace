"use client";

import { useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { DatabasePageFrame } from "@workspace/core/ui";
import { EmptyStateCard } from "@workspace/core/ui";

type PerfTab = "attendance" | "works" | "performance";

const tabs = getPageViewTabs("/hr/performance") as { key: PerfTab; label: string }[];

export default function HRPerformanceClient({ user: _user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeTab, setActiveTab] = useState<PerfTab>("attendance");

  return (
    <DatabasePageFrame
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(k) => setActiveTab(k as PerfTab)}
      contentClassName="max-w-5xl"
    >
        {activeTab === "attendance" && (
          <EmptyStateCard>考勤模块开发中...</EmptyStateCard>
        )}
        {activeTab === "works" && (
          <EmptyStateCard>工作查看模块开发中...</EmptyStateCard>
        )}
        {activeTab === "performance" && (
          <EmptyStateCard>绩效模块开发中...</EmptyStateCard>
        )}
    </DatabasePageFrame>
  );
}
