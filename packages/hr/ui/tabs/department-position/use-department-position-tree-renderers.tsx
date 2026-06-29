import type { PageSurfaceSectionSpec } from "@workspace/core/ui";
import type { Department, DepartmentPositionStats, Selection } from "./types";
import {
  buildDepartmentNodeBlock,
  buildOrganizationBranchBlock,
  buildOrganizationRootBlock,
} from "./tree-nodes";

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

  function departmentNodeBlock(department: Department): PageSurfaceSectionSpec | null {
    return buildDepartmentNodeBlock({
      department,
      departments,
      visibleDepartmentIds,
      selection,
      collapsedDepartments,
      search,
      departmentStats,
      onSelect: selectItem,
      onToggle: toggleDepartmentCollapsed,
    });
  }

  function organizationBranchBlock(department: Department): PageSurfaceSectionSpec | null {
    return buildOrganizationBranchBlock({
      department,
      departments,
      visibleDepartmentIds,
      collapsedDepartments,
      search,
      onToggle: toggleDepartmentCollapsed,
    });
  }

  function organizationRootBlock(department: Department): PageSurfaceSectionSpec | null {
    if (visibleDepartmentIds && !visibleDepartmentIds.has(department.id)) return null;
    return buildOrganizationRootBlock({
      department,
      departments,
      active: activeOrganizationRootId === department.id,
      onSelect: (departmentId) => {
        setActiveOrganizationRootId(departmentId);
        setCollapsedDepartments((prev) => {
          const next = new Set(prev);
          next.delete(departmentId);
          return next;
        });
      },
    });
  }

  return {
    departmentNodeBlock,
    organizationBranchBlock,
    organizationRootBlock,
  };
}
