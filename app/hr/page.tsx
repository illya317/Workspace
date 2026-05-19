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
import CompanyTab from "./CompanyTab";
import { CodesTab } from "./CodeTab";

import type { HRUser as User } from "./types";

import { QUERY_GROUP_LABELS } from "@/lib/company";

const LABEL_TO_MGMT: Record<string, string> = { "丰华生物": "常规体系", "丰华制药": "GMP" };

type HRTab = "roster" | "employees" | "positions" | "projects" | "project-info" | "codes" | "company";

const tabs: { key: HRTab; label: string; desc: string }[] = [
  { key: "roster", label: "花名册", desc: "员工花名册（只读）" },
  { key: "employees", label: "员工信息", desc: "员工基础信息编辑" },
  { key: "positions", label: "岗位信息", desc: "员工岗位关联编辑" },
  { key: "project-info", label: "项目信息", desc: "项目人员分配查看" },
  { key: "codes", label: "岗位管理", desc: "部门与岗位编码管理" },
  { key: "projects", label: "项目管理", desc: "项目/部门分组管理" },
  { key: "company", label: "公司信息", desc: "公司档案与股权结构" },
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
        const defaultCompany = QUERY_GROUP_LABELS.includes(data.user.company || "")
          ? data.user.company
          : QUERY_GROUP_LABELS[0];
        setSelectedCompany(defaultCompany || "");
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
            <span className="text-sm font-medium text-gray-700">组织人事</span>
          </div>
          <div className="flex items-center gap-4">
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
        {/* 公司选择器 */}
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">当前公司：</span>
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
          >
            {QUERY_GROUP_LABELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
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

        {activeTab === "roster" && user && <RosterTab user={user} selectedCompany={LABEL_TO_MGMT[selectedCompany] || selectedCompany} />}
        {activeTab === "employees" && user && <EmployeeTab user={user} selectedCompany={LABEL_TO_MGMT[selectedCompany] || selectedCompany} />}
        {activeTab === "positions" && user && <PositionTab user={user} selectedCompany={LABEL_TO_MGMT[selectedCompany] || selectedCompany} />}
        {activeTab === "projects" && user && <ProjectTab user={user} />}
        {activeTab === "project-info" && user && <ProjectInfoTab user={user} />}
        {activeTab === "codes" && user && <CodesTab user={user} selectedCompany={LABEL_TO_MGMT[selectedCompany] || selectedCompany} />}
        {activeTab === "company" && <CompanyTab />}
      </main>
    </div>
  );
}
