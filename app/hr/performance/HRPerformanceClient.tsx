"use client";

import { useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { EmptyStateCard, PageContent, TabBar } from "@workspace/core/ui";

type PerfTab = "attendance" | "works" | "performance";

const tabs: { key: PerfTab; label: string; desc: string }[] = [
  { key: "attendance", label: "考勤", desc: "考勤记录与统计" },
  { key: "works", label: "工作查看", desc: "查看全员工作清单" },
  { key: "performance", label: "绩效", desc: "绩效考核管理" },
];

export default function HRPerformanceClient({ user: _user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeTab, setActiveTab] = useState<PerfTab>("attendance");

  return (
    <PageContent className="max-w-5xl">
        <TabBar tabs={tabs} active={activeTab} onChange={(k) => setActiveTab(k as PerfTab)} />

        {activeTab === "attendance" && (
          <EmptyStateCard>考勤模块开发中...</EmptyStateCard>
        )}
        {activeTab === "works" && (
          <EmptyStateCard>工作查看模块开发中...</EmptyStateCard>
        )}
        {activeTab === "performance" && (
          <EmptyStateCard>绩效模块开发中...</EmptyStateCard>
        )}
    </PageContent>
  );
}
