"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";

type PerfTab = "attendance" | "works" | "performance";

const tabs: { key: PerfTab; label: string; desc: string }[] = [
  { key: "attendance", label: "考勤", desc: "考勤记录与统计" },
  { key: "works", label: "工作查看", desc: "查看全员工作清单" },
  { key: "performance", label: "绩效", desc: "绩效考核管理" },
];

export default function HRPerformanceClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PerfTab>("attendance");

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
            <span className="text-sm font-medium text-gray-700">考勤绩效</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/hr")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              组织人事
            </button>
            <button
              onClick={() => router.push("/hr/analytics")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              人力分析
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
