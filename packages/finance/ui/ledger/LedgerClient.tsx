"use client";

import { useState } from "react";
import { DataSurface, NavigationSurface } from "@workspace/core/ui";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import AccountTab from "./AccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";
import ReclassTab from "./ReclassTab";

const tabs = getPageViewTabs("/finance/ledger");

export default function LedgerClient({ canWrite }: { canWrite: boolean }) {
  const [activeTab, setActiveTab] = useState("accounts");

  return (
    <div className="space-y-4">
      <NavigationSurface
        kind="tabs"
        tabs={{ tabs, active: activeTab, onChange: setActiveTab }}
      />
      {activeTab === "accounts" && <AccountTab canWrite={canWrite} />}
      {activeTab === "vouchers" && <VoucherTab canWrite={canWrite} />}
      {activeTab === "ledger" && <LedgerTab />}
      {activeTab === "reclass" && <ReclassTab />}
      {activeTab === "depreciation" && (
        <DataSurface kind="records" records={[]} empty="资产折旧表开发中" />
      )}
    </div>
  );
}
