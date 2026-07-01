import type { SelectorSurfaceProps } from "@workspace/core/ui";
import type { Department, DepartmentPositionStats, Selection } from "./types";

export function useDepartmentPositionTreeRenderers({
  activeOrganizationRootId,
  collapsedDepartments,
  departmentStats,
  departments,
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
  selection: Selection;
  setActiveOrganizationRootId: (departmentId: number | null) => void;
  setCollapsedDepartments: (updater: (prev: Set<number>) => Set<number>) => void;
  selectItem: (selection: Selection) => void;
  visibleDepartmentIds: Set<number> | null;
}) {
  const rootDepartments = departments
    .filter((department) => !department.parentId)
    .filter((department) => !visibleDepartmentIds || visibleDepartmentIds.has(department.id))
    .sort((a, b) => a.id - b.id);
  const expandedIds = new Set(
    departments
      .filter((department) => !collapsedDepartments.has(department.id))
      .map((department) => department.id),
  );

  function toggleDepartmentCollapsed(departmentId: number) {
    setCollapsedDepartments((prev) => {
      const next = new Set(prev);
      if (next.has(departmentId)) next.delete(departmentId);
      else next.add(departmentId);
      return next;
    });
  }

  function departmentChildren(department: Department): Department[] | undefined {
    const children = departments
      .filter((item) => item.parentId === department.id)
      .filter((item) => !visibleDepartmentIds || visibleDepartmentIds.has(item.id))
      .sort((a, b) => a.id - b.id);
    return children.length > 0 ? children : undefined;
  }

  function rootDepartmentId(department: Department): number {
    let current = department;
    while (current.parentId) {
      const parent = departments.find((item) => item.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  }

  function departmentTreeSelector({
    loading,
    error,
  }: {
    loading: boolean;
    error: string | null;
    onClose?: () => void;
  }): SelectorSurfaceProps<Department> {
    return {
      kind: "tree",
      title: "部门岗位",
      loading,
      loadingText: "加载中...",
      emptyText: error || "暂无部门",
      items: error ? [] : rootDepartments,
      selectedId: selection?.type === "department" ? selection.id : null,
      onSelect: (department) => selectItem({ type: "department", id: department.id }),
      getKey: (department) => department.id,
      getChildren: departmentChildren,
      expandedIds,
      onToggle: (id) => toggleDepartmentCollapsed(Number(id)),
      renderItem: (department, ctx) => {
        const stats = departmentStats.get(department.id) ?? {
          directPositions: 0,
          totalPositions: 0,
          directHeadcount: 0,
          totalHeadcount: 0,
        };
        return {
          title: department.name,
          code: department.code,
          level: department.level || ctx.level,
          meta: [`总岗位 ${stats.totalPositions}`, `总编制 ${stats.totalHeadcount}`],
        };
      },
    };
  }

  function organizationRootSelector({
    loading,
    error,
  }: {
    loading: boolean;
    error: string | null;
    onClose?: () => void;
  }): SelectorSurfaceProps<Department> {
    return {
      kind: "tree",
      title: "全部部门层级",
      loading,
      loadingText: "加载中...",
      emptyText: error || "暂无部门",
      items: error ? [] : rootDepartments,
      selectedId: activeOrganizationRootId,
      onSelect: (department) => {
        setActiveOrganizationRootId(rootDepartmentId(department));
        selectItem({ type: "department", id: department.id });
        setCollapsedDepartments((prev) => {
          const next = new Set(prev);
          next.delete(department.id);
          return next;
        });
      },
      getKey: (department) => department.id,
      getChildren: departmentChildren,
      expandedIds,
      onToggle: (id) => toggleDepartmentCollapsed(Number(id)),
      renderItem: (department, ctx) => {
        const managerName = department.managerName;
        const children = departmentChildren(department) ?? [];
        return {
          title: department.name,
          code: department.code,
          level: department.level || ctx.level,
          meta: [
            managerName ? `负责人：${managerName}` : null,
            `下级 ${children.length}`,
          ].filter(Boolean) as string[],
        };
      },
    };
  }

  return {
    departmentTreeSelector,
    organizationRootSelector,
  };
}
