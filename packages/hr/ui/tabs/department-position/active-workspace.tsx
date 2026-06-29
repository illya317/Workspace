"use client";

import { createPageBody, PageSurface, type PageSurfaceSectionSpec, type PageSurfaceToolbarSpec } from "@workspace/core/ui";
import type { RosterSurfaceNavigationProps } from "../../roster-surface";

type SplitWorkspaceMode = "desktop" | "drawer";

export function DepartmentPositionActiveWorkspace({
  sections,
  drawerOpen,
  sideBlocks,
  sideOpen,
  surface,
  toolbarItems,
  onDrawerOpenChange,
  onSideOpenChange,
}: {
  sections: PageSurfaceSectionSpec[];
  drawerOpen: boolean;
  sideBlocks: (mode: SplitWorkspaceMode) => PageSurfaceSectionSpec[];
  sideOpen: boolean;
  surface?: RosterSurfaceNavigationProps;
  toolbarItems?: PageSurfaceToolbarSpec["items"];
  onDrawerOpenChange: (open: boolean) => void;
  onSideOpenChange: (open: boolean) => void;
}) {
  const toolbar = toolbarItems?.length ? { variant: "bar" as const, items: toolbarItems } : undefined;

  return (
    <PageSurface kind="standard"
      {...surface}
      toolbar={toolbar}
      body={{
        kind: "split",
        left: {
          sections: createPageBody(sideBlocks("desktop")).sections,
          drawerSections: createPageBody(sideBlocks("drawer")).sections,
        },
        right: createPageBody(sections),
        sideOpen,
        sideLabel: "部门岗位",
        onSideOpenChange,
        drawerOpen,
        onDrawerOpenChange,
        showSideControls: false,
      }}
    />
  );
}
