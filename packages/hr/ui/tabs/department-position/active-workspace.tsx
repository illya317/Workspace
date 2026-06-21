"use client";

import type { ComponentProps, ReactNode } from "react";
import { WorkspaceSplitPage } from "@workspace/core/ui";

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
  renderSide: ComponentProps<typeof WorkspaceSplitPage>["renderSide"];
  sideOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  onSideOpenChange: (open: boolean) => void;
}) {
  return (
    <WorkspaceSplitPage
      sideOpen={sideOpen}
      sideLabel="部门岗位"
      onSideOpenChange={onSideOpenChange}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={onDrawerOpenChange}
      showSideControls={false}
      renderSide={renderSide}
    >
      {children}
    </WorkspaceSplitPage>
  );
}
