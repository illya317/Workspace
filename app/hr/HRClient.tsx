"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";

import EmployeeTab from "./tabs/EmployeeTab";
import EmploymentTab from "./tabs/EmploymentTab";
import CompanyTab from "./tabs/CompanyTab";
import CompanyRelationTab from "./tabs/CompanyRelationTab";
import DepartmentTab from "./tabs/DepartmentTab";
import PositionTab from "./tabs/PositionTab";
import EDPTab from "./tabs/EDPTab";
import ProjectTab from "./tabs/ProjectTab";
import EmployeeProjectTab from "./tabs/EmployeeProjectTab";
import ContractTab from "./tabs/ContractTab";

import type { SessionUser } from "@/lib/types";
import type { HRUser } from "./types";

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

function toHRUser(user: SessionUser): HRUser {
  return {
    id: user.id,
    name: user.name,
    canAccessHR: user.canAccessHR ?? false,
    canEditHR: user.canEditHR ?? false,
    canDeleteHR: user.canDeleteHR ?? false,
    isWorkListAdmin: user.isWorkListAdmin ?? false,
    company: user.company ?? null,
  };
}

export default function HRClient({ user, hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<HRTab>("employee");
  const hrUser = toHRUser(user);

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideShell && (
        <nav className="bg-white shadow-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Image src="/company/logo.png" alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
              <span className="text-sm text-gray-400">|</span>
              <span className="text-sm font-medium text-gray-700">组织人事</span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => router.push("/hr/performance")} className="text-sm text-gray-500 hover:text-emerald-600">考勤绩效</button>
              <button onClick={() => router.push("/hr/analytics")} className="text-sm text-gray-500 hover:text-emerald-600">人力分析</button>
              <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
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

        <>
          {activeTab === "employee" && <EmployeeTab user={hrUser} />}
          {activeTab === "employment" && <EmploymentTab user={hrUser} />}
          {activeTab === "company" && <CompanyTab user={hrUser} />}
          {activeTab === "company-relation" && <CompanyRelationTab user={hrUser} />}
          {activeTab === "department" && <DepartmentTab user={hrUser} />}
          {activeTab === "position" && <PositionTab user={hrUser} />}
          {activeTab === "edp" && <EDPTab user={hrUser} />}
          {activeTab === "project" && <ProjectTab user={hrUser} />}
          {activeTab === "contract" && <ContractTab user={hrUser} />}
          {activeTab === "employee-project" && <EmployeeProjectTab user={hrUser} />}
        </>
      </main>
    </div>
  );
}
