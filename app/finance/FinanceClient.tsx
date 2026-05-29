"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import AccountTab from "./AccountTab";
import VoucherTab from "./VoucherTab";
import LedgerTab from "./LedgerTab";
import ReportTab from "./ReportTab";
import BudgetTab from "./BudgetTab";
import { SessionUser } from "@/lib/types";

type FinanceTab = "accounts" | "vouchers" | "ledger" | "reports" | "budget";

const tabs: { key: FinanceTab; label: string }[] = [
  { key: "accounts", label: "科目设置" },
  { key: "vouchers", label: "凭证录入" },
  { key: "ledger", label: "余额表" },
  { key: "reports", label: "财务报表" },
  { key: "budget", label: "管理会计" },
];

export default function FinanceClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FinanceTab>("accounts");

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/company/logo.png"
              alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
              width={100}
              height={30}
              className="h-auto w-auto max-w-[100px] object-contain"
            />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-700">财务管理</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/finance/analysis")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              财务分析
            </button>
            <button
              onClick={() => router.push("/finance/cost")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              成本管理
            </button>
            <button
              onClick={() => router.push("/finance/import")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              数据导入
            </button>
            <button
              onClick={() => router.push("/portal")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回入口
            </button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

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
        {activeTab === "reports" && <ReportTab />}
        {activeTab === "budget" && <BudgetTab />}
      </main>
    </div>
  );
}
