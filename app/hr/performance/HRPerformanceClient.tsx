"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import TabBar from "@/app/components/TabBar";
import { SessionUser } from "@/lib/types";

function hasKey(user: SessionUser, key: string) {
  return (user.visibleResourceKeys || []).includes(key);
}

type PerfTab = "attendance" | "works" | "performance";

const tabs: { key: PerfTab; label: string; desc: string }[] = [
  { key: "attendance", label: "考勤", desc: "考勤记录与统计" },
  { key: "works", label: "工作查看", desc: "查看全员工作清单" },
  { key: "performance", label: "绩效", desc: "绩效考核管理" },
];

export default function HRPerformanceClient({ user, hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PerfTab>("attendance");

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideShell && (
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/workspace/company/logo.png"
              alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
              width={100}
              height={30}
              className="h-auto w-auto max-w-[100px] object-contain"
            />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-700">考勤绩效</span>
          </div>
          <div className="flex items-center gap-4">
            {hasKey(user, "people.roster") && <button onClick={() => router.push("/hr")} className="text-sm text-gray-500 hover:text-emerald-600">人事首页</button>}
            {hasKey(user, "people.analytics") && <button onClick={() => router.push("/hr/analytics")} className="text-sm text-gray-500 hover:text-emerald-600">人力分析</button>}
            <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        <TabBar tabs={tabs} active={activeTab} onChange={(k) => setActiveTab(k as PerfTab)} />

        {activeTab === "attendance" && (
          <div className="flex min-h-[300px] items-center justify-center rounded-lg bg-white shadow-sm">
            <p className="text-sm text-gray-400">考勤模块开发中...</p>
          </div>
        )}
        {activeTab === "works" && (
          <div className="flex min-h-[300px] items-center justify-center rounded-lg bg-white shadow-sm">
            <p className="text-sm text-gray-400">工作查看模块开发中...</p>
          </div>
        )}
        {activeTab === "performance" && (
          <div className="flex min-h-[300px] items-center justify-center rounded-lg bg-white shadow-sm">
            <p className="text-sm text-gray-400">绩效模块开发中...</p>
          </div>
        )}
      </main>
    </div>
  );
}
