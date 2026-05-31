"use client";

import { useState } from "react";
import TabBar from "@/app/components/TabBar";
import AccountTab from "./AccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";

const tabs = [
  { key: "accounts", label: "科目设置" },
  { key: "vouchers", label: "凭证明细" },
  { key: "ledger", label: "余额表" },
];

export default function LedgerClient({ canWrite }: { canWrite: boolean }) {
  const [activeTab, setActiveTab] = useState("accounts");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "accounts" && <AccountTab canWrite={canWrite} />}
      {activeTab === "vouchers" && <VoucherTab />}
      {activeTab === "ledger" && <LedgerTab />}
    </main>
  );
}
