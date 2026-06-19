"use client";

import { useState } from "react";
import { EmptyStateCard, PageContent, TabBar } from "@workspace/core/ui";
import AccountTab from "./AccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";
import ReclassTab from "./ReclassTab";

const tabs = [
  { key: "accounts", label: "科目设置" },
  { key: "vouchers", label: "凭证明细" },
  { key: "ledger", label: "余额表" },
  { key: "reclass", label: "重分类表" },
  { key: "depreciation", label: "资产折旧" },
];

export default function LedgerClient({ canWrite }: { canWrite: boolean }) {
  const [activeTab, setActiveTab] = useState("accounts");

  return (
    <PageContent className="max-w-5xl">
      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "accounts" && <AccountTab canWrite={canWrite} />}
      {activeTab === "vouchers" && <VoucherTab canWrite={canWrite} />}
      {activeTab === "ledger" && <LedgerTab />}
      {activeTab === "reclass" && <ReclassTab />}
      {activeTab === "depreciation" && (
        <EmptyStateCard>资产折旧表开发中</EmptyStateCard>
      )}
    </PageContent>
  );
}
