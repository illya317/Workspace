"use client";

import { createPageBody, PageSurface, type PageSurfaceBlockSpec, type PageSurfaceSideSpec, type PageSurfaceToolbarSpec } from "@workspace/core/ui";
import type { RosterSurfaceNavigationProps } from "../../roster-surface";

type SplitWorkspaceMode = "desktop" | "drawer";

export function DepartmentPositionActiveWorkspace({
  blocks,
  drawerOpen,
  sideBlocks,
  sideOpen,
  surface,
  toolbarItems,
  onDrawerOpenChange,
  onSideOpenChange,
}: {
  blocks: PageSurfaceBlockSpec[];
  drawerOpen: boolean;
  sideBlocks: (mode: SplitWorkspaceMode) => PageSurfaceBlockSpec[];
  sideOpen: boolean;
  surface?: RosterSurfaceNavigationProps;
  toolbarItems?: PageSurfaceToolbarSpec["items"];
  onDrawerOpenChange: (open: boolean) => void;
  onSideOpenChange: (open: boolean) => void;
}) {
  const side: PageSurfaceSideSpec = {
    blocks: sideBlocks("desktop"),
    drawerBlocks: sideBlocks("drawer"),
  };

  const toolbar = toolbarItems?.length ? { variant: "bar" as const, items: toolbarItems } : undefined;

  return (
    <PageSurface
      {...surface}
      kind="split"
      toolbar={toolbar}
      sideOpen={sideOpen}
      sideLabel="部门岗位"
      onSideOpenChange={onSideOpenChange}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={onDrawerOpenChange}
      showSideControls={false}
      side={side}
      body={createPageBody(blocks)}
    />
  );
}
