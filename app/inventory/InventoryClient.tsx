"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import RawMaterialTab from "./RawMaterialTab";
import PackagingTab from "./PackagingTab";
import FinishedGoodsTab from "./FinishedGoodsTab";
import ReportTab from "./ReportTab";
import { SessionUser } from "@/lib/types";

type InvTab = "raw" | "packaging" | "finished" | "reports";

const tabs: { key: InvTab; label: string }[] = [
  { key: "raw", label: "原辅料库存" },
  { key: "packaging", label: "包装材料库存" },
  { key: "finished", label: "成品库存" },
  { key: "reports", label: "库存报表中心" },
];

export default function InventoryClient({ user, hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<InvTab>("raw");

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideShell && (
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/company/logo.png" alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-700">库存管理</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/production")} className="text-sm text-gray-500 hover:text-emerald-600">返回</button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>
      )}

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

        {activeTab === "raw" && <RawMaterialTab />}
        {activeTab === "packaging" && <PackagingTab />}
        {activeTab === "finished" && <FinishedGoodsTab />}
        {activeTab === "reports" && <ReportTab />}
      </main>
    </div>
  );
}
