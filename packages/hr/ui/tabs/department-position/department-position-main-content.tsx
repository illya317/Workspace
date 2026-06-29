"use client";

import type { BodySurfaceSectionSpec, SelectorSurfaceProps } from "@workspace/core/ui";
import type { RosterSurfaceNavigationProps } from "../../roster-surface";
import { DepartmentPositionActiveWorkspace } from "./active-workspace";
import { useDepartmentPositionDetailBlocks } from "./department-position-detail-area";
import { buildDepartmentPositionToolbarItems } from "./department-position-toolbar-items";
import type { Department } from "./types";

export function DepartmentPositionMainContent({
  treeOpen,
  treeDrawerOpen,
  treeSelector,
  treeDrawerSelector,
  createPanel,
  departments,
  departmentById,
  canEdit,
  isOrganizationMode,
  showArchived,
  search,
  collapsedDepartments,
  onSearchChange,
  onCreatePanelChange,
  onCollapseAll,
  onLoadData,
  detailBlocks,
  onSideOpenChange,
  onDrawerOpenChange,
  surface,
}: {
  treeOpen: boolean;
  treeDrawerOpen: boolean;
  treeSelector: SelectorSurfaceProps;
  treeDrawerSelector: SelectorSurfaceProps;
  createPanel: "department" | "position" | null;
  departments: Department[];
  departmentById: Map<number, Department>;
  canEdit: boolean;
  isOrganizationMode: boolean;
  showArchived: boolean;
  search: string;
  collapsedDepartments: Set<number>;
  onSearchChange: (value: string) => void;
  onCreatePanelChange: (panel: "department" | "position" | null) => void;
  onCollapseAll: (collapsed: boolean) => void;
  onLoadData: () => Promise<void>;
  detailBlocks: BodySurfaceSectionSpec[];
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  surface?: RosterSurfaceNavigationProps;
}) {
  const toolbarItems = buildDepartmentPositionToolbarItems({
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
  });
  const workspaceBlocks = useDepartmentPositionDetailBlocks({
    createPanel,
    departments,
    departmentById,
    canEdit,
    onCancel: () => onCreatePanelChange(null),
    onCreated: async () => {
      onCreatePanelChange(null);
      await onLoadData();
    },
    detailBlocks,
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
