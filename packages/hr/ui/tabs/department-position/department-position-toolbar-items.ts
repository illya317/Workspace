import type { SurfaceAutocompleteOptionSpec, SurfaceToolbarItem, SurfaceToolbarItems, SurfaceToolbarActionGroupActionSpec } from "@workspace/core/ui";

const DEPARTMENT_POSITION_SEARCH_PLACEHOLDER = "搜索部门/岗位";
const DEPARTMENT_POSITION_SEARCH_ARIA_LABEL = "搜索部门或岗位";

export function buildDepartmentPositionToolbarItems({
  isOrganizationMode,
  showArchived,
  search,
  searchOptions,
  sideOpen,
  showSideLabel,
  hideSideLabel,
  onSearchChange,
  onSideOpenChange,
  onDrawerOpenChange,
  assistantAction,
}: {
  isOrganizationMode: boolean;
  showArchived: boolean;
  search: string;
  searchOptions: SurfaceAutocompleteOptionSpec[];
  sideOpen: boolean;
  showSideLabel: string;
  hideSideLabel: string;
  onSearchChange: (value: string) => void;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  assistantAction?: SurfaceToolbarActionGroupActionSpec;
}): SurfaceToolbarItems {
  const assistantItems: SurfaceToolbarItems = assistantAction
    ? [{ kind: "action-group", key: "assistant-actions", actions: [assistantAction] }]
    : [];
  if (isOrganizationMode || showArchived) return assistantItems;

  const items: SurfaceToolbarItem[] = [
    {
      kind: "panel-toggle",
      key: "mobile-tree-toggle",
      icon: "panel-open",
      label: showSideLabel,
      visibility: "mobile",
      onClick: () => onDrawerOpenChange(true),
    },
    {
      kind: "panel-toggle",
      key: "desktop-tree-toggle",
      icon: sideOpen ? "panel-close" : "panel-open",
      label: sideOpen ? hideSideLabel : showSideLabel,
      variant: sideOpen ? "primary" : "secondary",
      visibility: "desktop",
      onClick: () => onSideOpenChange(!sideOpen),
    },
    {
      kind: "autocomplete",
      key: "search",
      value: search,
      options: searchOptions,
      onChange: onSearchChange,
      placeholder: DEPARTMENT_POSITION_SEARCH_PLACEHOLDER,
      ariaLabel: DEPARTMENT_POSITION_SEARCH_ARIA_LABEL,
      visibleCount: 8,
    },
  ];

  return [...items, ...assistantItems];
}
