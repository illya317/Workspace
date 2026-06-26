"use client";

import type { ReactNode } from "react";
import { PageSurface, type PageSurfaceSideSpec } from "@workspace/core/ui";

type SplitWorkspaceMode = "desktop" | "drawer";

export function DepartmentPositionActiveWorkspace({
  children,
  drawerOpen,
  renderSide,
  sideOpen,
  onDrawerOpenChange,
  onSideOpenChange,
}: {
  children: ReactNode;
  drawerOpen: boolean;
  renderSide: (mode: SplitWorkspaceMode) => ReactNode;
  sideOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  onSideOpenChange: (open: boolean) => void;
}) {
  const side: PageSurfaceSideSpec = {
    blocks: [{ kind: "moduleView", key: "desktop", view: renderSide("desktop") }],
    drawerBlocks: [{ kind: "moduleView", key: "drawer", view: renderSide("drawer") }],
  };

  return (
    <PageSurface
      embedded
      kind="split"
      sideOpen={sideOpen}
      sideLabel="部门岗位"
      onSideOpenChange={onSideOpenChange}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={onDrawerOpenChange}
      showSideControls={false}
      contentClassName="!max-w-none !px-0 !py-0"
      side={side}
      blocks={[{ kind: "moduleView", key: "content", view: children }]}
    />
  );
}
