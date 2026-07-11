"use client";

import { createPageBody, PageSurface, type BodySurfaceSectionSpec, type PageSurfaceToolbarSpec, type SelectorSurfaceProps } from "@workspace/core/ui";
import type { RosterSurfaceTabBarProps } from "../../roster-surface";
import type { Department } from "./types";

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
  selector: SelectorSurfaceProps<Department>;
  drawerSelector: SelectorSurfaceProps<Department>;
  sideOpen: boolean;
  surface?: RosterSurfaceTabBarProps;
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
        sideLabel: "组织岗位",
        onSideOpenChange,
        drawerOpen,
        onDrawerOpenChange,
        showSideControls: false,
      }}
    />
  );
}
