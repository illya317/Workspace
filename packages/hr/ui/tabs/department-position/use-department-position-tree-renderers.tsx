import {
  createSelectorTreeExpandedIds,
  setSelectorTreeNodeExpanded,
  type SelectorSurfaceProps,
  type SelectorSurfaceStructuredTreeItemSpec,
} from "@workspace/core/ui";
import type { Department, DepartmentPositionStats, Selection } from "./types";
import { displayParentDepartment, displayParentId } from "./utils";

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
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const rootDepartments = departments
    .filter((department) => displayParentId(department, departmentById) == null)
    .filter((department) => !visibleDepartmentIds || visibleDepartmentIds.has(department.id))
    .sort((a, b) => a.hierarchyKind.localeCompare(b.hierarchyKind) || a.level - b.level || a.id - b.id);
  const expandedIds = createSelectorTreeExpandedIds({
    items: departments,
    getKey: (department) => department.id,
    collapsedIds: collapsedDepartments,
  });

  function setDepartmentExpanded(departmentId: number, expanded: boolean) {
    setCollapsedDepartments((prev) => setSelectorTreeNodeExpanded(prev, departmentId, expanded));
  }

  function departmentChildren(department: Department): Department[] | undefined {
    const children = departments
      .filter((item) => displayParentId(item, departmentById) === department.id)
      .filter((item) => !visibleDepartmentIds || visibleDepartmentIds.has(item.id))
      .sort((a, b) => a.id - b.id);
    return children.length > 0 ? children : undefined;
  }

  function rootDepartmentId(department: Department): number {
    let current = department;
    let parent = displayParentDepartment(current, departmentById);
    while (parent) {
      current = parent;
      parent = displayParentDepartment(current, departmentById);
    }
    return current.id;
  }

  function declareDepartmentStatsItems(nodes: Department[], level = 1): SelectorSurfaceStructuredTreeItemSpec<Department>[] {
    return nodes.map((department) => {
      const stats = departmentStats.get(department.id) ?? {
        directPositions: 0,
        totalPositions: 0,
        directHeadcount: 0,
        totalHeadcount: 0,
      };
      const children = departmentChildren(department) ?? [];
      return {
        key: department.id,
        value: department,
        card: {
          title: department.name,
          code: department.code,
          level: department.level || level,
          showLevelBadge: false,
          meta: [`总岗位 ${stats.totalPositions}`, `总编制 ${stats.totalHeadcount}`],
        },
        children: children.length ? declareDepartmentStatsItems(children, level + 1) : undefined,
      };
    });
  }

  function declareOrganizationItems(nodes: Department[], level = 1): SelectorSurfaceStructuredTreeItemSpec<Department>[] {
    return nodes.map((department) => {
      const children = departmentChildren(department) ?? [];
      return {
        key: department.id,
        value: department,
        card: {
          title: department.name,
          code: department.code,
          level: department.level || level,
          showLevelBadge: false,
          meta: [department.managerName ? `负责人：${department.managerName}` : null, `下级 ${children.length}`].filter(Boolean) as string[],
        },
        children: children.length ? declareOrganizationItems(children, level + 1) : undefined,
      };
    });
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
      title: "组织岗位",
      loading,
      loadingText: "加载中...",
      emptyText: error || "暂无组织",
      items: error ? [] : declareDepartmentStatsItems(rootDepartments),
      selectedId: selection?.type === "department" ? selection.id : null,
      onSelect: (department) => selectItem({ type: "department", id: department.id }),
      expandedIds,
      onToggle: (id, expanded) => setDepartmentExpanded(Number(id), expanded),
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
      title: "全部组织层级",
      loading,
      loadingText: "加载中...",
      emptyText: error || "暂无组织",
      items: error ? [] : declareOrganizationItems(rootDepartments),
      selectedId: activeOrganizationRootId,
      onSelect: (department) => {
        setActiveOrganizationRootId(rootDepartmentId(department));
        selectItem({ type: "department", id: department.id });
        setCollapsedDepartments((prev) => setSelectorTreeNodeExpanded(prev, department.id, true));
      },
      expandedIds,
      onToggle: (id, expanded) => setDepartmentExpanded(Number(id), expanded),
    };
  }

  return {
    departmentTreeSelector,
    organizationRootSelector,
  };
}
