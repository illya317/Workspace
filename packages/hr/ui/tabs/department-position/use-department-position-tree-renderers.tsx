import type { SelectorSurfaceProps } from "@workspace/core/ui";
import type { Department, DepartmentPositionStats, Selection } from "./types";
import { departmentManagerPositionName } from "./draft-utils";

export function useDepartmentPositionTreeRenderers({
  activeOrganizationRootId,
  collapsedDepartments,
  departmentStats,
  departments,
  search,
  selection,
  onSearchChange,
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
  onSearchChange: (value: string) => void;
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

  function departmentTreeSelector({
    loading,
    error,
    onClose,
  }: {
    loading: boolean;
    error: string | null;
    onClose?: () => void;
  }): SelectorSurfaceProps<Department> {
    return {
      kind: "tree",
      title: "部门岗位",
      commands: onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
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
      filter: { kind: "search", value: search, onChange: onSearchChange, placeholder: "搜索部门..." },
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
    onClose,
  }: {
    loading: boolean;
    error: string | null;
    onClose?: () => void;
  }): SelectorSurfaceProps<Department> {
    return {
      kind: "list",
      title: "全部部门层级",
      commands: onClose ? [{ key: "close", label: "关闭", onClick: onClose }] : undefined,
      loading,
      loadingText: "加载中...",
      emptyText: error || "暂无部门",
      items: error ? [] : rootDepartments,
      selectedId: activeOrganizationRootId,
      onSelect: (department) => {
        setActiveOrganizationRootId(department.id);
        selectItem({ type: "department", id: department.id });
        setCollapsedDepartments((prev) => {
          const next = new Set(prev);
          next.delete(department.id);
          return next;
        });
      },
      getKey: (department) => department.id,
      renderItem: (department) => {
        const managerName = departmentManagerPositionName(department);
        const children = departmentChildren(department) ?? [];
        return {
          title: department.name,
          code: department.code,
          level: 1,
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
