"use client";

import { useMemo, useState } from "react";
import UiComponentsShowcase from "@workspace/core/showcase/UiComponentsShowcase";
import {
  createPageBody,
  createPageTabBar,
  PageSurface,
  useFeedback,
} from "@workspace/core/ui";
import { useDatabaseRelationsTab } from "../admin/tabs/DatabaseRelationsTab";
import { useModuleManagementSection } from "../admin/tabs/ModuleManagementTab";
import { useOperationsRecordsTab } from "./OperationsRecordsTab";
import { useSqlSettingsTab } from "./SqlSettingsTab";

type GovernanceTab = "ui" | "dataRelations" | "sqlSettings" | "modules" | "operations";

export default function PlatformGovernanceClient({ isSuperAdmin, canAuditOperations }: { isSuperAdmin: boolean; canAuditOperations: boolean }) {
  const [activeTab, setActiveTab] = useState<GovernanceTab>("ui");
  const feedback = useFeedback();
  const showToast = feedback.notify;
  const tabs = useMemo(() => [
    { key: "ui", label: "UI" },
    ...(isSuperAdmin ? [
      { key: "dataRelations", label: "数据关系" },
      { key: "sqlSettings", label: "SQL 设置" },
      { key: "modules", label: "模块管理" },
    ] : []),
    ...(canAuditOperations ? [{ key: "operations", label: "运维记录" }] : []),
  ], [canAuditOperations, isSuperAdmin]);
  const tabbar = createPageTabBar({
    items: tabs,
    active: activeTab,
    onChange: (key) => {
      if (key === "ui" || (canAuditOperations && key === "operations") || (isSuperAdmin && (key === "dataRelations" || key === "sqlSettings" || key === "modules"))) {
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
  const sqlSettingsBody = useSqlSettingsTab({
    enabled: activeTab === "sqlSettings" && isSuperAdmin,
    showToast,
  });
  const operationsTab = useOperationsRecordsTab({
    enabled: activeTab === "operations" && canAuditOperations,
    showToast,
  });

  if (activeTab === "ui") return <UiComponentsShowcase tabbar={tabbar} />;

  return (
    <PageSurface
      kind="standard"
      tabbar={tabbar}
      toolbar={activeTab === "dataRelations"
        ? { items: databaseRelationsTab.toolbarItems }
        : activeTab === "operations"
          ? { items: operationsTab.toolbarItems }
          : undefined}
      body={activeTab === "dataRelations"
        ? databaseRelationsTab.body
        : activeTab === "sqlSettings"
          ? sqlSettingsBody
        : activeTab === "modules"
          ? createPageBody([modulesSection])
          : operationsTab.body}
      footer={activeTab === "operations" ? operationsTab.footer : undefined}
    />
  );
}
