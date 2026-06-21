"use client";

import { useState } from "react";
import { EmptyStateCard } from "@workspace/core/ui";
import { DatabasePageFrame } from "@workspace/core/ui";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import AccountTab from "./AccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";
import ReclassTab from "./ReclassTab";

const tabs = getPageViewTabs("/finance/ledger");

export default function LedgerClient({ canWrite }: { canWrite: boolean }) {
  const [activeTab, setActiveTab] = useState("accounts");

  return (
    <DatabasePageFrame tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "accounts" && <AccountTab canWrite={canWrite} />}
      {activeTab === "vouchers" && <VoucherTab canWrite={canWrite} />}
      {activeTab === "ledger" && <LedgerTab />}
      {activeTab === "reclass" && <ReclassTab />}
      {activeTab === "depreciation" && (
        <EmptyStateCard>资产折旧表开发中</EmptyStateCard>
      )}
    </DatabasePageFrame>
  );
}
