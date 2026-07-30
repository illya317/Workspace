"use client";

import { useMemo, useState } from "react";
import UiComponentsShowcase from "@workspace/core/showcase/UiComponentsShowcase";
import {
  createPageBody,
  createPageTabBar,
  createStatusSection,
  PageSurface,
  useFeedback,
} from "@workspace/core/ui";
import { useDatabaseRelationsTab } from "../admin/tabs/DatabaseRelationsTab";
import { useModuleManagementSection } from "../admin/tabs/ModuleManagementTab";

type GovernanceTab = "ui" | "dataRelations" | "modules" | "operations";

export default function PlatformGovernanceClient({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState<GovernanceTab>("ui");
  const feedback = useFeedback();
  const showToast = feedback.notify;
  const tabs = useMemo(() => [
    { key: "ui", label: "UI" },
    ...(isSuperAdmin ? [
      { key: "dataRelations", label: "数据关系" },
      { key: "modules", label: "模块管理" },
    ] : []),
    { key: "operations", label: "运维记录" },
  ], [isSuperAdmin]);
  const tabbar = createPageTabBar({
    items: tabs,
    active: activeTab,
    onChange: (key) => {
      if (key === "ui" || key === "operations" || (isSuperAdmin && (key === "dataRelations" || key === "modules"))) {
        setActiveTab(key);
      }
    },
    ariaLabel: "平台治理",
  });
  const databaseRelationsTab = useDatabaseRelationsTab({
    enabled: activeTab === "dataRelations" && isSuperAdmin,
    showToast,
  });
  const modulesSection = useModuleManagementSection({
    showToast,
    enabled: activeTab === "modules" && isSuperAdmin,
  });

  if (activeTab === "ui") return <UiComponentsShowcase tabbar={tabbar} />;

  const operationsBody = createPageBody([
    createStatusSection("operations-records-empty", {
      kind: "empty",
      content: "暂无运维记录",
    }),
  ]);

  return (
    <PageSurface
      kind="standard"
      tabbar={tabbar}
      toolbar={activeTab === "dataRelations" ? { items: databaseRelationsTab.toolbarItems } : undefined}
      body={activeTab === "dataRelations"
        ? databaseRelationsTab.body
        : activeTab === "modules"
          ? createPageBody([modulesSection])
          : operationsBody}
    />
  );
}
