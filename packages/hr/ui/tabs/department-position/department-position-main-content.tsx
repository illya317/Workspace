"use client";

import type { BodySurfaceSectionSpec, SelectorSurfaceProps, SurfaceAutocompleteOptionSpec } from "@workspace/core/ui";
import type { RosterSurfaceTabBarProps } from "../../roster-surface";
import { DepartmentPositionActiveWorkspace } from "./active-workspace";
import { useDepartmentPositionDetailSections } from "./department-position-detail-area";
import { buildDepartmentPositionToolbarItems } from "./department-position-toolbar-items";
import type { Department, Selection } from "./types";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";

export function DepartmentPositionMainContent({
  treeOpen,
  treeDrawerOpen,
  treeSelector,
  treeDrawerSelector,
  createPanel,
  departments,
  departmentById,
  departmentCreateRuntime,
  isOrganizationMode,
  showArchived,
  search,
  searchOptions,
  onSearchChange,
  onSearchSelect,
  onCreatePanelChange,
  onLoadData,
  detailSections,
  onSideOpenChange,
  onDrawerOpenChange,
  surface,
}: {
  treeOpen: boolean;
  treeDrawerOpen: boolean;
  treeSelector: SelectorSurfaceProps<Department>;
  treeDrawerSelector: SelectorSurfaceProps<Department>;
  createPanel: "department" | "position" | null;
  departments: Department[];
  departmentById: Map<number, Department>;
  departmentCreateRuntime: ActionRuntime | null;
  isOrganizationMode: boolean;
  showArchived: boolean;
  search: string;
  searchOptions: SurfaceAutocompleteOptionSpec[];
  onSearchChange: (value: string) => void;
  onSearchSelect: (selection: Selection) => void;
  onCreatePanelChange: (panel: "department" | "position" | null) => void;
  onLoadData: () => Promise<void>;
  detailSections: BodySurfaceSectionSpec[];
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  surface?: RosterSurfaceTabBarProps;
}) {
  const toolbarItems = buildDepartmentPositionToolbarItems({
    isOrganizationMode,
    showArchived,
    search,
    searchOptions,
    sideOpen: treeOpen,
    showSideLabel: "显示组织岗位",
    hideSideLabel: "隐藏组织岗位",
    onSearchChange: (value) => {
      const selection = parseDepartmentPositionSearchValue(value);
      if (!selection) {
        onSearchChange(value);
        return;
      }
      onSearchSelect(selection);
      onSearchChange("");
    },
    onSideOpenChange,
    assistantAction: surface?.assistantAction,
  });
  const workspaceBlocks = useDepartmentPositionDetailSections({
    createPanel,
    departments,
    departmentById,
    actionRuntime: departmentCreateRuntime,
    onCreatePanelChange,
    onCancel: () => onCreatePanelChange(null),
    onCreated: async () => {
      onCreatePanelChange(null);
      await onLoadData();
    },
    detailSections,
  });

  return (
    <DepartmentPositionActiveWorkspace
      sideOpen={treeOpen}
      drawerOpen={treeDrawerOpen}
      onSideOpenChange={onSideOpenChange}
      onDrawerOpenChange={onDrawerOpenChange}
      selector={treeSelector}
      drawerSelector={treeDrawerSelector}
      sections={workspaceBlocks}
      toolbarItems={toolbarItems}
      surface={surface}
    />
  );
}

function parseDepartmentPositionSearchValue(value: string): Exclude<Selection, null> | null {
  const [type, rawId] = value.split(":");
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (type === "department") return { type: "department", id };
  if (type === "position") return { type: "position", id };
  return null;
}
