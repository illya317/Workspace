"use client";

import { useState } from "react";
import AccountTab from "./AccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";

type LedgerTabKey = "accounts" | "vouchers" | "ledger";

const tabs: { key: LedgerTabKey; label: string }[] = [
  { key: "accounts", label: "科目设置" },
  { key: "vouchers", label: "凭证明细" },
  { key: "ledger", label: "余额表" },
];

export default function LedgerClient() {
  const [activeTab, setActiveTab] = useState<LedgerTabKey>("accounts");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "border-b-2 border-emerald-500 text-emerald-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "accounts" && <AccountTab />}
      {activeTab === "vouchers" && <VoucherTab />}
      {activeTab === "ledger" && <LedgerTab />}
    </main>
  );
}
