import type { ToolbarItem } from "@workspace/core/ui";
import type { Department } from "./types";

export function buildDepartmentPositionToolbarItems({
  canEdit,
  createPanel,
  isOrganizationMode,
  showArchived,
  search,
  departments,
  collapsedDepartments,
  onCreatePanelChange,
  onSearchChange,
  onCollapseAll,
}: {
  canEdit: boolean;
  createPanel: "department" | "position" | null;
  isOrganizationMode: boolean;
  showArchived: boolean;
  search: string;
  departments: Department[];
  collapsedDepartments: Set<number>;
  onCreatePanelChange: (panel: "department" | "position" | null) => void;
  onSearchChange: (value: string) => void;
  onCollapseAll: (collapsed: boolean) => void;
}): ToolbarItem[] {
  if (isOrganizationMode || showArchived) return [];

  const allCollapsed = departments.length > 0 && departments.every((department) => collapsedDepartments.has(department.id));

  const items: (ToolbarItem | null)[] = [
    canEdit
      ? {
          kind: "create",
          key: "create-department",
          label: "新建部门",
          active: createPanel === "department",
          onClick: () => onCreatePanelChange(createPanel === "department" ? null : "department"),
        }
      : null,
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
      section: "filter",
      value: search,
      onChange: onSearchChange,
      placeholder: "搜索部门/岗位",
      scope: ["部门", "岗位"],
      className: "w-full min-w-[18rem] sm:w-80",
    },
  ];

  return items.filter((item): item is ToolbarItem => Boolean(item));
}
