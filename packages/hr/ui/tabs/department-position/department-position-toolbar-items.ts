import type { SurfaceToolbarItem, SurfaceToolbarItems } from "@workspace/core/ui";
import type { Department } from "./types";

export function buildDepartmentPositionToolbarItems({
  isOrganizationMode,
  showArchived,
  search,
  departments,
  collapsedDepartments,
  onSearchChange,
  onCollapseAll,
}: {
  isOrganizationMode: boolean;
  showArchived: boolean;
  search: string;
  departments: Department[];
  collapsedDepartments: Set<number>;
  onSearchChange: (value: string) => void;
  onCollapseAll: (collapsed: boolean) => void;
}): SurfaceToolbarItems {
  if (isOrganizationMode || showArchived) return [];

  const allCollapsed = departments.length > 0 && departments.every((department) => collapsedDepartments.has(department.id));

  const items: SurfaceToolbarItem[] = [
    {
      kind: "panel-toggle",
      key: "collapse-all",
      icon: allCollapsed ? "panel-open" : "panel-close",
      label: allCollapsed ? "展开全部" : "折叠全部",
      onClick: () => onCollapseAll(!allCollapsed),
    },
    {
      kind: "search",
      key: "search",
      value: search,
      onChange: onSearchChange,
      placeholder: "搜索部门/岗位",
      scope: ["部门", "岗位"],
    },
  ];

  return items;
}
