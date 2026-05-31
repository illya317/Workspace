"use client";

import { useState } from "react";
import TabBar from "@/app/components/TabBar";
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
    <main className="mx-auto max-w-5xl px-4 py-6">
      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "accounts" && <AccountTab canWrite={canWrite} />}
      {activeTab === "vouchers" && <VoucherTab canWrite={canWrite} />}
      {activeTab === "ledger" && <LedgerTab />}
      {activeTab === "reclass" && <ReclassTab />}
      {activeTab === "depreciation" && (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm">
          <p className="text-sm text-gray-400">资产折旧表——开发中</p>
        </div>
      )}
    </main>
  );
}
