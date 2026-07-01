"use client";

import { useDeferredValue, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createMessageSection, createPageBody, createPageTabsNavigation, PageSurface, useFeedback } from "@workspace/core/ui";
import { type SurfaceNavigationTabSpec } from "@workspace/core/ui";
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
import type { RosterSurfaceNavigationProps } from "./roster-surface";

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

type HRViewTab = SurfaceNavigationTabSpec & { key: HRView };

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

export default function HRClient({
  user,
  canArchiveRoster = false,
}: {
  user: SessionUser;
  hideShell?: boolean;
  canArchiveRoster?: boolean;
}) {
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

  const surface = {
    navigation: createPageTabsNavigation({
      items: rosterViews,
      active: activeView,
      activeChild,
      onChange: changeView,
      onChildChange: changeChild,
    }),
  } satisfies RosterSurfaceNavigationProps;

  if (renderedView === "employee") {
    return <EmployeeDirectory user={hrUser} employmentStatus={employeeStatus} surface={surface} />;
  }

  if (renderedView === "organization") {
    return (
      <DepartmentPositionTab
        user={hrUser}
        mode="organization"
        surface={surface}
        canArchive={canArchiveRoster}
        onUnsavedChange={setHasUnsavedChanges}
        onOpenDepartmentDetails={(departmentId) => void openDepartmentDetails(departmentId)}
        onOpenPositionDetails={(positionId) => void openPositionDetails(positionId)}
      />
    );
  }

  if (renderedView === "department-position") {
    return (
      <DepartmentPositionTab
        user={hrUser}
        mode="position"
        lifecycle={departmentLifecycle}
        surface={surface}
        canArchive={canArchiveRoster}
        focusDepartmentId={focusDepartmentId}
        focusPositionId={focusPositionId}
        onUnsavedChange={setHasUnsavedChanges}
        onFocusDepartmentConsumed={() => setFocusDepartmentId(null)}
        onFocusPositionConsumed={() => setFocusPositionId(null)}
      />
    );
  }

  if (renderedView === "bulk") {
    if (activeBulkTab === "employment") return <GenericTableTab config={employmentConfig} user={hrUser} surface={surface} />;
    if (activeBulkTab === "edp") return <GenericTableTab config={edpConfig} user={hrUser} surface={surface} />;
    if (activeBulkTab === "contract") return <GenericTableTab config={contractConfig} user={hrUser} surface={surface} />;
    return <GenericTableTab config={employeeConfig} user={hrUser} surface={surface} />;
  }

  if (renderedView === "generated") {
    return <RosterGeneratedTab variant={activeGeneratedVariant} canEdit={canEditGenerated} surface={surface} />;
  }

  return (
    <PageSurface kind="standard"
      navigation={surface.navigation}
      body={createPageBody([createMessageSection("empty", {
        content: "暂无可用视图",
        tone: "muted"
      })])}
    />
  );
}
