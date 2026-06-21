import type { ReactNode } from "react";
import type { Department, DepartmentPositionStats, Selection } from "./types";
import { DepartmentNode, OrganizationBranchNode, OrganizationRootCard } from "./tree-nodes";

export function useDepartmentPositionTreeRenderers({
  activeOrganizationRootId,
  collapsedDepartments,
  departmentStats,
  departments,
  search,
  selection,
  setActiveOrganizationRootId,
  setCollapsedDepartments,
  selectItem,
  visibleDepartmentIds,
}: {
  activeOrganizationRootId: number | null;
  collapsedDepartments: Set<number>;
  departmentStats: Map<number, DepartmentPositionStats>;
  departments: Department[];
  search: string;
  selection: Selection;
  setActiveOrganizationRootId: (departmentId: number | null) => void;
  setCollapsedDepartments: (updater: (prev: Set<number>) => Set<number>) => void;
  selectItem: (selection: Selection) => void;
  visibleDepartmentIds: Set<number> | null;
}) {
  function toggleDepartmentCollapsed(departmentId: number) {
    setCollapsedDepartments((prev) => {
      const next = new Set(prev);
      if (next.has(departmentId)) next.delete(departmentId);
      else next.add(departmentId);
      return next;
    });
  }

  function renderDepartmentNode(department: Department, level = 0): ReactNode {
    return (
      <DepartmentNode
        key={department.id}
        department={department}
        level={level}
        departments={departments}
        visibleDepartmentIds={visibleDepartmentIds}
        selection={selection}
        collapsedDepartments={collapsedDepartments}
        search={search}
        departmentStats={departmentStats}
        onSelect={selectItem}
        onToggle={toggleDepartmentCollapsed}
      />
    );
  }

  function renderOrganizationBranch(department: Department, level = 0): ReactNode {
    return (
      <OrganizationBranchNode
        key={department.id}
        department={department}
        level={level}
        departments={departments}
        visibleDepartmentIds={visibleDepartmentIds}
        collapsedDepartments={collapsedDepartments}
        search={search}
        onToggle={toggleDepartmentCollapsed}
      />
    );
  }

  function renderOrganizationRoot(department: Department): ReactNode {
    if (visibleDepartmentIds && !visibleDepartmentIds.has(department.id)) return null;
    return (
      <OrganizationRootCard
        key={department.id}
        department={department}
        departments={departments}
        active={activeOrganizationRootId === department.id}
        onSelect={(departmentId) => {
          setActiveOrganizationRootId(departmentId);
          setCollapsedDepartments((prev) => {
            const next = new Set(prev);
            next.delete(departmentId);
            return next;
          });
        }}
      />
    );
  }

  return {
    renderDepartmentNode,
    renderOrganizationBranch,
    renderOrganizationRoot,
  };
}
