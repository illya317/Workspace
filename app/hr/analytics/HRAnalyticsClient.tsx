"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";
import { useAnalyticsData } from "./useAnalyticsData";
import EmployeeAnalytics from "./EmployeeAnalytics";
import DepartmentAnalytics from "./DepartmentAnalytics";
import PositionAnalytics from "./PositionAnalytics";
import TurnoverAnalytics from "./TurnoverAnalytics";
import ContractAnalytics from "./ContractAnalytics";
import HeadcountTrend from "./HeadcountTrend";

type AnalyticsTab = "employee" | "department" | "position" | "turnover" | "contract" | "headcount";

const tabs: { key: AnalyticsTab; label: string; desc: string }[] = [
  { key: "employee", label: "员工信息", desc: "员工分布与统计" },
  { key: "department", label: "部门架构", desc: "部门层级与编制" },
  { key: "position", label: "岗位分析", desc: "岗位配置与空岗" },
  { key: "contract", label: "合同预警", desc: "合同到期提醒" },
  { key: "headcount", label: "人员流动", desc: "入职离职趋势" },
  { key: "turnover", label: "离职分析", desc: "离职率与原因" },
];

export default function HRAnalyticsClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("employee");
  const data = useAnalyticsData();

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
            <span className="text-sm font-medium text-gray-700">人力分析</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/hr")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              组织人事
            </button>
            <button
              onClick={() => router.push("/hr/performance")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              考勤绩效
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
        {/* Tabs */}
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

        {/* Data loading state */}
        {data.loading && (
          <div className="flex min-h-[300px] items-center justify-center rounded-lg bg-white shadow-sm">
            <p className="text-sm text-gray-400">数据加载中...</p>
          </div>
        )}
        {data.error && (
          <div className="flex min-h-[300px] items-center justify-center rounded-lg bg-white shadow-sm">
            <p className="text-sm text-red-500">{data.error}</p>
          </div>
        )}

        {/* Tab contents */}
        {!data.loading && !data.error && (
          <>
            {activeTab === "employee" && (
              <EmployeeAnalytics employees={data.employees} employments={data.employments} edps={data.edps} />
            )}
            {activeTab === "department" && (
              <DepartmentAnalytics departments={data.departments} edps={data.edps} />
            )}
            {activeTab === "position" && (
              <PositionAnalytics positions={data.positions} edps={data.edps} departments={data.departments} />
            )}
            {activeTab === "turnover" && (
              <TurnoverAnalytics employees={data.employees} employments={data.employments} />
            )}
            {activeTab === "contract" && (
              <ContractAnalytics contracts={data.contracts} />
            )}
            {activeTab === "headcount" && (
              <HeadcountTrend employments={data.employments} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
