"use client";

import { FormSurface } from "@workspace/core/ui";
import { DepartmentPositionActiveWorkspace } from "./active-workspace";
import { DepartmentPositionDetailArea } from "./department-position-detail-area";
import { buildDepartmentPositionToolbarItems } from "./department-position-toolbar-items";
import type { Department } from "./types";

export function DepartmentPositionMainContent({
  treeOpen,
  treeDrawerOpen,
  renderTreePanel,
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
  renderDetailPane,
  onSideOpenChange,
  onDrawerOpenChange,
}: {
  treeOpen: boolean;
  treeDrawerOpen: boolean;
  renderTreePanel: (mode: "desktop" | "drawer") => React.ReactNode;
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
  renderDetailPane: () => React.ReactNode;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
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

  return (
    <>
      {toolbarItems.length > 0 && (
        <FormSurface kind="inline" toolbar={{ variant: "bar", items: toolbarItems }} className="mb-3" />
      )}
      <DepartmentPositionActiveWorkspace
        sideOpen={treeOpen}
        drawerOpen={treeDrawerOpen}
        onSideOpenChange={onSideOpenChange}
        onDrawerOpenChange={onDrawerOpenChange}
        renderSide={renderTreePanel}
      >
        <DepartmentPositionDetailArea
          createPanel={createPanel}
          departments={departments}
          departmentById={departmentById}
          canEdit={canEdit}
          onCancel={() => onCreatePanelChange(null)}
          onCreated={async () => {
            onCreatePanelChange(null);
            await onLoadData();
          }}
          renderDetailPane={renderDetailPane}
        />
      </DepartmentPositionActiveWorkspace>
    </>
  );
}
