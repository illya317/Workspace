"use client";

import type { BodySurfaceSectionSpec, SelectorSurfaceProps, SurfaceAutocompleteOptionSpec } from "@workspace/core/ui";
import type { RosterSurfaceTabBarProps } from "../../roster-surface";
import { DepartmentPositionActiveWorkspace } from "./active-workspace";
import { useDepartmentPositionDetailSections } from "./department-position-detail-area";
import { buildDepartmentPositionToolbarItems } from "./department-position-toolbar-items";
import type { Department, OrganizationCodeConfig, Selection } from "./types";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";

export function DepartmentPositionMainContent({
  treeSelector,
  createPanel,
  departments,
  codeConfig,
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
  surface,
}: {
  treeSelector: SelectorSurfaceProps<Department>;
  createPanel: "department" | "position" | null;
  departments: Department[];
  codeConfig: OrganizationCodeConfig | null;
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
  surface?: RosterSurfaceTabBarProps;
}) {
  const toolbarItems = buildDepartmentPositionToolbarItems({
    isOrganizationMode,
    showArchived,
    search,
    searchOptions,
    onSearchChange: (value) => {
      const selection = parseDepartmentPositionSearchValue(value);
      if (!selection) {
        onSearchChange(value);
        return;
      }
      onSearchSelect(selection);
      onSearchChange("");
    },
    assistantAction: surface?.assistantAction,
  });
  const workspace = useDepartmentPositionDetailSections({
    createPanel,
    departments,
    codeConfig,
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
      selector={treeSelector}
      create={workspace.create}
      sections={workspace.sections}
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
