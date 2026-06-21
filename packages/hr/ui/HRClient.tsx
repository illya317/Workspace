"use client";

import { useState } from "react";
import { DatabasePageFrame } from "@workspace/core/ui";
import { type AccordionTabItem } from "@workspace/core/ui";
import { getPageViewTabs } from "@workspace/platform/view-registry";

import GenericTableTab from "./tabs/GenericTableTab";
import DepartmentPositionTab from "./tabs/DepartmentPositionTab";
import EmployeeDirectory from "./profile/EmployeeDirectory";
import {
  contractConfig,
  edpConfig,
  employeeConfig,
  employmentConfig,
} from "@workspace/hr/constants/tab-configs";

import type { SessionUser } from "@workspace/platform/types";
import type { HRUser } from "@workspace/hr/types";

type HRTab =
  | "employee"
  | "employment"
  | "contract"
  | "department"
  | "position"
  | "edp";

type HRView = "employee" | "organization" | "department-position" | "bulk";

type HRViewTab = AccordionTabItem & { key: HRView };

const rosterViews = getPageViewTabs("/hr/roster") as HRViewTab[];

function toHRUser(user: SessionUser): HRUser {
  return {
    id: user.id,
    name: user.employeeName || user.nickname,
    visibleResourceKeys: user.visibleResourceKeys || [],
    visibleWriteResourceKeys: user.visibleWriteResourceKeys || [],
    isAdmin: user.isSuperAdmin ?? false,
    company: user.company ?? null,
  };
}

export default function HRClient({ user }: { user: SessionUser; hideShell?: boolean }) {
  const [activeView, setActiveView] = useState<HRView>("employee");
  const [activeChild, setActiveChild] = useState<string | undefined>(
    rosterViews.find((view) => view.key === "employee")?.children?.[0]?.key,
  );
  const hrUser = toHRUser(user);
  const activeBulkTab = (activeChild ?? "employee") as HRTab;
  const employeeStatus = activeChild === "inactive" ? "inactive" : "active";
  const departmentLifecycle = activeChild === "archived" ? "archived" : "active";

  function changeView(key: string) {
    const nextView = rosterViews.find((view) => view.key === key);
    setActiveView(key as HRView);
    setActiveChild(nextView?.children?.[0]?.key);
  }

  return (
    <DatabasePageFrame
      tabs={rosterViews}
      activeTab={activeView}
      activeChild={activeChild}
      onTabChange={changeView}
      onChildChange={setActiveChild}
    >
        {activeView === "employee" && <EmployeeDirectory user={hrUser} employmentStatus={employeeStatus} />}

        {activeView === "organization" && <DepartmentPositionTab user={hrUser} mode="organization" />}

        {activeView === "department-position" && (
          <DepartmentPositionTab user={hrUser} mode="position" lifecycle={departmentLifecycle} />
        )}

        {activeView === "bulk" && (
          <>
            <>
              {activeBulkTab === "employee" && <GenericTableTab config={employeeConfig} user={hrUser} />}
              {activeBulkTab === "employment" && <GenericTableTab config={employmentConfig} user={hrUser} />}
              {activeBulkTab === "edp" && <GenericTableTab config={edpConfig} user={hrUser} />}
              {activeBulkTab === "contract" && <GenericTableTab config={contractConfig} user={hrUser} />}
            </>
          </>
        )}
    </DatabasePageFrame>
  );
}
