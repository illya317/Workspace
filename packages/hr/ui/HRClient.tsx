"use client";

import { useDeferredValue, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { DatabasePageFrame, useFeedback } from "@workspace/core/ui";
import { type TabDef } from "@workspace/core/ui";
import { getPageViewTabsForUser } from "@workspace/platform/view-registry";

import {
  contractConfig,
  edpConfig,
  employeeConfig,
  employmentConfig,
} from "@workspace/hr/constants/tab-configs";
import type { SessionUser } from "@workspace/platform/types";
import type { HRUser } from "@workspace/hr/types";
import type { RosterGeneratedVariant } from "@workspace/hr/types";

const GenericTableTab = dynamic(() => import("./tabs/GenericTableTab"));
const DepartmentPositionTab = dynamic(() => import("./tabs/DepartmentPositionTab"));
const EmployeeDirectory = dynamic(() => import("./profile/EmployeeDirectory"));
const RosterGeneratedTab = dynamic(() => import("./generated/RosterGeneratedTab"));

type HRTab =
  | "employee"
  | "employment"
  | "contract"
  | "department"
  | "position"
  | "edp";

type HRView = "employee" | "organization" | "department-position" | "bulk" | "generated";

type HRViewTab = TabDef & { key: HRView };

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
  const rosterViews = useMemo(
    () => getPageViewTabsForUser("/hr/roster", user.visibleResourceKeys || []) as HRViewTab[],
    [user.visibleResourceKeys],
  );
  const [activeView, setActiveView] = useState<HRView>("employee");
  const [activeChild, setActiveChild] = useState<string | undefined>(
    rosterViews.find((view) => view.key === "employee")?.children?.[0]?.key,
  );
  const [focusDepartmentId, setFocusDepartmentId] = useState<number | null>(null);
  const [focusPositionId, setFocusPositionId] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const feedback = useFeedback({ unsavedChanges: hasUnsavedChanges });
  const renderedView = useDeferredValue(activeView);
  const renderedChild = useDeferredValue(activeChild);
  const hrUser = toHRUser(user);
  const activeBulkTab = (renderedChild ?? "employee") as HRTab;
  const activeGeneratedVariant = (renderedChild === "dueDiligence" ? "dueDiligence" : "management") as RosterGeneratedVariant;
  const employeeStatus = renderedChild === "inactive" ? "inactive" : "active";
  const departmentLifecycle = renderedChild === "archived" ? "archived" : "active";
  const canEditGenerated = hrUser.isAdmin || hrUser.visibleWriteResourceKeys.includes("hr.roster.generated");

  function canLeaveCurrentView() {
    if (!hasUnsavedChanges) return true;
    return feedback.confirmLeave();
  }

  function clearFocusTargets() {
    setFocusDepartmentId(null);
    setFocusPositionId(null);
  }

  async function changeView(key: string) {
    if (key === activeView) return;
    const canLeave = canLeaveCurrentView();
    if (canLeave !== true && !(await canLeave)) return;
    if (hasUnsavedChanges) setHasUnsavedChanges(false);
    clearFocusTargets();
    const nextView = rosterViews.find((view) => view.key === key);
    setActiveView(key as HRView);
    setActiveChild(nextView?.children?.[0]?.key);
  }

  async function openPositionDetails(positionId: number) {
    const canLeave = canLeaveCurrentView();
    if (canLeave !== true && !(await canLeave)) return;
    if (hasUnsavedChanges) setHasUnsavedChanges(false);
    setFocusDepartmentId(null);
    setFocusPositionId(positionId);
    setActiveView("department-position");
    setActiveChild("active");
  }

  async function openDepartmentDetails(departmentId: number) {
    const canLeave = canLeaveCurrentView();
    if (canLeave !== true && !(await canLeave)) return;
    if (hasUnsavedChanges) setHasUnsavedChanges(false);
    setFocusPositionId(null);
    setFocusDepartmentId(departmentId);
    setActiveView("department-position");
    setActiveChild("active");
  }

  async function changeChild(key: string) {
    if (key === activeChild) return;
    const canLeave = canLeaveCurrentView();
    if (canLeave !== true && !(await canLeave)) return;
    if (hasUnsavedChanges) setHasUnsavedChanges(false);
    clearFocusTargets();
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
        {renderedView === "employee" && <EmployeeDirectory user={hrUser} employmentStatus={employeeStatus} />}

        {renderedView === "organization" && (
          <DepartmentPositionTab
            user={hrUser}
            mode="organization"
            onUnsavedChange={setHasUnsavedChanges}
            onOpenDepartmentDetails={(departmentId) => void openDepartmentDetails(departmentId)}
            onOpenPositionDetails={(positionId) => void openPositionDetails(positionId)}
          />
        )}

        {renderedView === "department-position" && (
          <DepartmentPositionTab
            user={hrUser}
            mode="position"
            lifecycle={departmentLifecycle}
            focusDepartmentId={focusDepartmentId}
            focusPositionId={focusPositionId}
            onUnsavedChange={setHasUnsavedChanges}
            onFocusDepartmentConsumed={() => setFocusDepartmentId(null)}
            onFocusPositionConsumed={() => setFocusPositionId(null)}
          />
        )}

        {renderedView === "bulk" && (
          <>
            <>
              {activeBulkTab === "employee" && <GenericTableTab config={employeeConfig} user={hrUser} />}
              {activeBulkTab === "employment" && <GenericTableTab config={employmentConfig} user={hrUser} />}
              {activeBulkTab === "edp" && <GenericTableTab config={edpConfig} user={hrUser} />}
              {activeBulkTab === "contract" && <GenericTableTab config={contractConfig} user={hrUser} />}
            </>
          </>
        )}

        {renderedView === "generated" && (
          <RosterGeneratedTab variant={activeGeneratedVariant} canEdit={canEditGenerated} />
        )}
    </DatabasePageFrame>
  );
}
