"use client";

import { createPageBody, PageSurface, type BodySurfaceSectionSpec, type PageSurfaceToolbarSpec, type SelectorSurfaceProps } from "@workspace/core/ui";
import type { RosterSurfaceNavigationProps } from "../../roster-surface";

export function DepartmentPositionActiveWorkspace({
  sections,
  drawerOpen,
  selector,
  drawerSelector,
  sideOpen,
  surface,
  toolbarItems,
  onDrawerOpenChange,
  onSideOpenChange,
}: {
  sections: BodySurfaceSectionSpec[];
  drawerOpen: boolean;
  selector: SelectorSurfaceProps;
  drawerSelector: SelectorSurfaceProps;
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
        kind: "section",
        layout: "split",
        left: { kind: "selector", selector },
        drawerLeft: drawerSelector ? { kind: "selector", selector: drawerSelector } : undefined,
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
