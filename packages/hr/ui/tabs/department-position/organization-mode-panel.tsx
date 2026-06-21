"use client";

import type { ReactNode } from "react";
import { OrganizationView } from "./organization-view";
import type { Department } from "./types";

export function OrganizationModePanel({
  activeOrganizationRoot,
  departments,
  error,
  loading,
  renderOrganizationBranch,
  renderOrganizationRootPanel,
  treeDrawerOpen,
  visibleRootDepartmentCount,
  setTreeDrawerOpen,
}: {
  activeOrganizationRoot: Department | null | undefined;
  departments: Department[];
  error: string | null;
  loading: boolean;
  renderOrganizationBranch: (department: Department) => ReactNode;
  renderOrganizationRootPanel: (mode: "desktop" | "drawer") => ReactNode;
  treeDrawerOpen: boolean;
  visibleRootDepartmentCount: number;
  setTreeDrawerOpen: (open: boolean) => void;
}) {
  const activeOrganizationChildren = activeOrganizationRoot
    ? departments.filter((department) => department.parentId === activeOrganizationRoot.id).sort((a, b) => a.id - b.id)
    : [];

  return (
    <OrganizationView
      drawerOpen={treeDrawerOpen}
      loading={loading}
      error={error}
      activeOrganizationRoot={activeOrganizationRoot}
      activeOrganizationChildren={activeOrganizationChildren}
      visibleRootDepartmentCount={visibleRootDepartmentCount}
      renderSide={renderOrganizationRootPanel}
      renderOrganizationBranch={renderOrganizationBranch}
      onDrawerOpenChange={setTreeDrawerOpen}
    />
  );
}
