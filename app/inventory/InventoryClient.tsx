"use client";

import { useState } from "react";
import { PageContent, TabBar } from "@workspace/core/ui";
import { AppShell } from "@workspace/platform/ui";
import RawMaterialTab from "./RawMaterialTab";
import PackagingTab from "./PackagingTab";
import FinishedGoodsTab from "./FinishedGoodsTab";
import ReportTab from "./ReportTab";
import { SessionUser } from "@workspace/platform/types";

type InvTab = "raw" | "packaging" | "finished" | "reports";

const tabs: { key: InvTab; label: string }[] = [
  { key: "raw", label: "原辅料库存" },
  { key: "packaging", label: "包装材料库存" },
  { key: "finished", label: "成品库存" },
  { key: "reports", label: "库存报表中心" },
];

export default function InventoryClient({ user, hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const [activeTab, setActiveTab] = useState<InvTab>("raw");

  const content = (
    <PageContent className="py-6">
      <TabBar tabs={tabs} active={activeTab} onChange={(key) => setActiveTab(key as InvTab)} />

      {activeTab === "raw" && <RawMaterialTab />}
      {activeTab === "packaging" && <PackagingTab />}
      {activeTab === "finished" && <FinishedGoodsTab />}
      {activeTab === "reports" && <ReportTab />}
    </PageContent>
  );

  if (hideShell) {
    return content;
  }

  return (
    <AppShell title="库存管理" backHref="/production" user={user}>
      {content}
    </AppShell>
  );
}
