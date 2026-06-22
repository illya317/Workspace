"use client";

import { useState } from "react";
import { DatabasePageFrame, EmptyStateCard } from "@workspace/core/ui";
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
import { useUnsavedChangesPrompt } from "./hooks/useUnsavedChangesPrompt";

import type { SessionUser } from "@workspace/platform/types";
import type { HRUser } from "@workspace/hr/types";

type HRTab =
  | "employee"
  | "employment"
  | "contract"
  | "department"
  | "position"
  | "edp";

type HRView = "employee" | "organization" | "department-position" | "bulk" | "generated";

type HRViewTab = AccordionTabItem & { key: HRView };

const rosterViews = getPageViewTabs("/hr/roster") as HRViewTab[];

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
  const [activeChild, setActiveChild] = useState<string | undefined>(
    rosterViews.find((view) => view.key === "employee")?.children?.[0]?.key,
  );
  const [focusPositionId, setFocusPositionId] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const confirmNavigation = useUnsavedChangesPrompt(hasUnsavedChanges);
  const hrUser = toHRUser(user);
  const activeBulkTab = (activeChild ?? "employee") as HRTab;
  const employeeStatus = activeChild === "inactive" ? "inactive" : "active";
  const departmentLifecycle = activeChild === "archived" ? "archived" : "active";

  async function changeView(key: string) {
    if (key !== activeView) {
      const canLeave = await confirmNavigation();
      if (!canLeave) return;
      setHasUnsavedChanges(false);
    }
    const nextView = rosterViews.find((view) => view.key === key);
    setActiveView(key as HRView);
    setActiveChild(nextView?.children?.[0]?.key);
  }

  async function openPositionDetails(positionId: number) {
    const canLeave = await confirmNavigation();
    if (!canLeave) return;
    setHasUnsavedChanges(false);
    setFocusPositionId(positionId);
    setActiveView("department-position");
    setActiveChild("active");
  }

  async function changeChild(key: string) {
    if (key !== activeChild) {
      const canLeave = await confirmNavigation();
      if (!canLeave) return;
      setHasUnsavedChanges(false);
    }
    setActiveChild(key);
  }

  return (
    <DatabasePageFrame
      tabs={rosterViews}
      activeTab={activeView}
      activeChild={activeChild}
      onTabChange={changeView}
      onChildChange={changeChild}
    >
        {activeView === "employee" && <EmployeeDirectory user={hrUser} employmentStatus={employeeStatus} />}

        {activeView === "organization" && (
          <DepartmentPositionTab
            user={hrUser}
            mode="organization"
            onUnsavedChange={setHasUnsavedChanges}
            onOpenPositionDetails={(positionId) => void openPositionDetails(positionId)}
          />
        )}

        {activeView === "department-position" && (
          <DepartmentPositionTab
            user={hrUser}
            mode="position"
            lifecycle={departmentLifecycle}
            focusPositionId={focusPositionId}
            onUnsavedChange={setHasUnsavedChanges}
            onFocusPositionConsumed={() => setFocusPositionId(null)}
          />
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

        {activeView === "generated" && <EmptyStateCard>暂无花名册生成记录</EmptyStateCard>}
    </DatabasePageFrame>
  );
}
