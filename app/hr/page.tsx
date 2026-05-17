"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import EmployeeTab from "./EmployeeTab";
import PositionTab from "./PositionTab";
import ProjectTab from "./ProjectTab";
import ProjectInfoTab from "./ProjectInfoTab";
import RosterTab from "./RosterTab";
import { CodesTab } from "./CodeTab";

interface User {
  id: number;
  name: string;
  canAccessHR: boolean;
  isWorkListAdmin: boolean;
  company?: string | null;
}

const HR_COMPANIES = ["丰华生物", "丰华制药"];

type HRTab = "roster" | "employees" | "positions" | "projects" | "project-info" | "codes" | "attendance" | "works" | "performance";

const tabs: { key: HRTab; label: string; desc: string }[] = [
  { key: "roster", label: "花名册", desc: "员工花名册（只读）" },
  { key: "employees", label: "员工信息", desc: "员工基础信息编辑" },
  { key: "positions", label: "岗位信息", desc: "员工岗位关联编辑" },
  { key: "projects", label: "项目管理", desc: "项目/部门分组管理" },
  { key: "project-info", label: "项目信息", desc: "项目人员分配查看" },
  { key: "codes", label: "部门岗位", desc: "部门与岗位编码管理" },
  { key: "attendance", label: "考勤", desc: "考勤记录与统计" },
  { key: "works", label: "工作查看", desc: "查看全员工作清单" },
  { key: "performance", label: "绩效", desc: "绩效考核管理" },
];

export default function HRPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HRTab>("roster");
  const [selectedCompany, setSelectedCompany] = useState<string>("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user || !data.user.canAccessHR) {
          router.push("/portal");
          return;
        }
        setUser(data.user);
        const defaultCompany = data.user.isWorkListAdmin
          ? (HR_COMPANIES.includes(data.user.company || "") ? data.user.company : HR_COMPANIES[0])
          : (data.user.company || "");
        setSelectedCompany(defaultCompany);
        setLoading(false);
      })
      .catch(() => router.push("/portal"));
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

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
            <span className="text-sm font-medium text-gray-700">人事行政管理</span>
          </div>
          <div className="flex items-center gap-4">
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
        {/* 公司选择器 */}
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">当前公司：</span>
          {user?.isWorkListAdmin ? (
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
            >
              {HR_COMPANIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <span className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700">
              {selectedCompany || "未设置"}
            </span>
          )}
        </div>

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

        {activeTab === "roster" && user && <RosterTab user={user} selectedCompany={selectedCompany} />}
        {activeTab === "employees" && user && <EmployeeTab user={user} selectedCompany={selectedCompany} />}
        {activeTab === "positions" && user && <PositionTab user={user} selectedCompany={selectedCompany} />}
        {activeTab === "projects" && user && <ProjectTab user={user} />}
        {activeTab === "project-info" && user && <ProjectInfoTab user={user} />}
        {activeTab === "codes" && user && <CodesTab user={user} selectedCompany={selectedCompany} />}
        {activeTab !== "roster" && activeTab !== "employees" && activeTab !== "positions" && activeTab !== "codes" && (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-800">
              {tabs.find((t) => t.key === activeTab)?.label}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {tabs.find((t) => t.key === activeTab)?.desc} — 功能建设中，敬请期待
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
