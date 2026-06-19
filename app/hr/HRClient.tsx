"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";

import EmployeeTab from "./tabs/EmployeeTab";
import EmploymentTab from "./tabs/EmploymentTab";
import DepartmentPositionTab from "./tabs/DepartmentPositionTab";
import EDPTab from "./tabs/EDPTab";
import ContractTab from "./tabs/ContractTab";
import EmployeeDirectory from "./profile/EmployeeDirectory";

import type { SessionUser } from "@/lib/types";
import type { HRUser } from "./types";

type HRTab =
  | "employee"
  | "employment"
  | "contract"
  | "department"
  | "position"
  | "edp";

type HRView = "employee" | "department-position" | "bulk";

const views: { key: HRView; label: string }[] = [
  { key: "employee", label: "员工资料" },
  { key: "department-position", label: "部门岗位" },
  { key: "bulk", label: "员工信息表" },
];

const bulkTabs: { key: HRTab; label: string }[] = [
  { key: "employee", label: "员工信息" },
  { key: "employment", label: "雇佣关系" },
  { key: "contract", label: "合同" },
  { key: "edp", label: "部门岗位" },
];

function toHRUser(user: SessionUser): HRUser {
  return {
    id: user.id,
    name: user.name,
    visibleResourceKeys: user.visibleResourceKeys || [],
    visibleWriteResourceKeys: user.visibleWriteResourceKeys || [],
    isAdmin: user.isSuperAdmin ?? false,
    company: user.company ?? null,
  };
}

function hasKey(user: SessionUser, key: string) {
  return (user.visibleResourceKeys || []).includes(key);
}

export default function HRClient({ user, hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<HRView>("employee");
  const [activeTab, setActiveTab] = useState<HRTab>("employee");
  const hrUser = toHRUser(user);

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideShell && (
        <nav className="bg-white shadow-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Image src="/workspace/company/logo.png" alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
              <span className="text-sm text-gray-400">|</span>
              <span className="text-sm font-medium text-gray-700">组织人事</span>
            </div>
            <div className="flex items-center gap-4">
              {hasKey(user, "people.performance") && <button onClick={() => router.push("/hr/performance")} className="text-sm text-gray-500 hover:text-emerald-600">考勤绩效</button>}
              {hasKey(user, "people.analytics") && <button onClick={() => router.push("/hr/analytics")} className="text-sm text-gray-500 hover:text-emerald-600">人力分析</button>}
              <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
              <UserMenu user={user} />
            </div>
          </div>
        </nav>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex gap-2 overflow-x-auto border-b border-gray-200 pb-1">
          {views.map((view) => (
            <button
              key={view.key}
              onClick={() => setActiveView(view.key)}
              className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeView === view.key
                  ? "border-b-2 border-emerald-500 text-emerald-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {view.label}
            </button>
          ))}
        </div>

        {activeView === "employee" && <EmployeeDirectory user={hrUser} />}

        {activeView === "department-position" && <DepartmentPositionTab user={hrUser} />}

        {activeView === "bulk" && (
          <>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              员工信息表保留原有多人表格编辑方式，适合集中修员工相关数据；日常单人维护建议从“员工资料”进入详情页。
            </div>
            <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-1">
              {bulkTabs.map((t) => (
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
              {activeTab === "edp" && <EDPTab user={hrUser} />}
              {activeTab === "contract" && <ContractTab user={hrUser} />}
            </>
          </>
        )}
      </main>
    </div>
  );
}
