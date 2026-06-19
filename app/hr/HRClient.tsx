"use client";

import { useState } from "react";
import { PageContent, TabBar } from "@workspace/core/ui";

import EmployeeTab from "./tabs/EmployeeTab";
import EmploymentTab from "./tabs/EmploymentTab";
import DepartmentPositionTab from "./tabs/DepartmentPositionTab";
import EDPTab from "./tabs/EDPTab";
import ContractTab from "./tabs/ContractTab";
import EmployeeDirectory from "./profile/EmployeeDirectory";

import type { SessionUser } from "@workspace/platform/types";
import type { HRUser } from "./types";

type HRTab =
  | "employee"
  | "employment"
  | "contract"
  | "department"
  | "position"
  | "edp";

type HRView = "employee" | "organization" | "department-position" | "bulk";

const views: { key: HRView; label: string }[] = [
  { key: "employee", label: "员工资料" },
  { key: "organization", label: "组织架构" },
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

export default function HRClient({ user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeView, setActiveView] = useState<HRView>("employee");
  const [activeTab, setActiveTab] = useState<HRTab>("employee");
  const hrUser = toHRUser(user);

  return (
    <PageContent>
      <TabBar tabs={views} active={activeView} onChange={(key) => setActiveView(key as HRView)} />

        {activeView === "employee" && <EmployeeDirectory user={hrUser} />}

        {activeView === "organization" && <DepartmentPositionTab user={hrUser} mode="organization" />}

        {activeView === "department-position" && <DepartmentPositionTab user={hrUser} mode="position" />}

        {activeView === "bulk" && (
          <>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              员工信息表保留原有多人表格编辑方式，适合集中修员工相关数据；日常单人维护建议从“员工资料”进入详情页。
            </div>
            <TabBar tabs={bulkTabs} active={activeTab} onChange={(key) => setActiveTab(key as HRTab)} />

            <>
              {activeTab === "employee" && <EmployeeTab user={hrUser} />}
              {activeTab === "employment" && <EmploymentTab user={hrUser} />}
              {activeTab === "edp" && <EDPTab user={hrUser} />}
              {activeTab === "contract" && <ContractTab user={hrUser} />}
            </>
          </>
        )}
    </PageContent>
  );
}
