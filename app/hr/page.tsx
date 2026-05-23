"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";

import EmployeeTab from "./EmployeeTab";
import EmploymentTab from "./EmploymentTab";
import CompanyTab from "./CompanyTab";
import CompanyRelationTab from "./CompanyRelationTab";
import DepartmentTab from "./DepartmentTab";
import PositionTab from "./PositionTab";
import EDPTab from "./EDPTab";
import ProjectTab from "./ProjectTab";
import EmployeeProjectTab from "./EmployeeProjectTab";
import ContractTab from "./ContractTab";


// 花名册代码保留但不展示
// import RosterTab from "./RosterTab";

import type { HRUser as User } from "./types";

type HRTab =
  | "employee"
  | "employment"
  | "contract"
  | "company"
  | "company-relation"
  | "department"
  | "position"
  | "edp"
  | "project"
  | "employee-project";

const tabs: { key: HRTab; label: string }[] = [
  { key: "employee", label: "员工信息" },
  { key: "employment", label: "雇佣关系" },
  { key: "contract", label: "合同" },
  { key: "department", label: "部门" },
  { key: "position", label: "岗位" },
  { key: "edp", label: "EDP" },
  { key: "project", label: "项目" },
  { key: "employee-project", label: "项目员工" },
];

export default function HRPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HRTab>("employee");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user || !data.user.canAccessHR) {
          router.push("/portal");
          return;
        }
        setUser(data.user);
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

        {user && (
          <>
            {activeTab === "employee" && <EmployeeTab user={user} />}
            {activeTab === "employment" && <EmploymentTab user={user} />}
            {activeTab === "company" && <CompanyTab user={user} />}
            {activeTab === "company-relation" && <CompanyRelationTab user={user} />}
            {activeTab === "department" && <DepartmentTab user={user} />}
            {activeTab === "position" && <PositionTab user={user} />}
            {activeTab === "edp" && <EDPTab user={user} />}
            {activeTab === "project" && <ProjectTab user={user} />}
            {activeTab === "contract" && <ContractTab user={user} />}
            {activeTab === "employee-project" && <EmployeeProjectTab user={user} />}
          </>
        )}
      </main>
    </div>
  );
}
