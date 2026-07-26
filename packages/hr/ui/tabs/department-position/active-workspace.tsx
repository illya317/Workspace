"use client";

import { createMasterDetailBody, createPageBody, PageSurface, type BodySurfaceSectionSpec, type PageSurfaceToolbarSpec, type SelectorSurfaceProps } from "@workspace/core/ui";
import type { RosterSurfaceTabBarProps } from "../../roster-surface";
import type { Department } from "./types";

export function DepartmentPositionActiveWorkspace({
  sections,
  selector,
  surface,
  toolbarItems,
}: {
  sections: BodySurfaceSectionSpec[];
  selector: SelectorSurfaceProps<Department>;
  surface?: RosterSurfaceTabBarProps;
  toolbarItems?: PageSurfaceToolbarSpec["items"];
}) {
  const toolbar = toolbarItems?.length ? { variant: "bar" as const, items: toolbarItems } : undefined;

  return (
    <PageSurface kind="standard"
      {...surface}
      toolbar={toolbar}
      body={createMasterDetailBody({
        master: {
          label: "组织岗位",
          presentation: "compact",
          body: { kind: "selector", selector },
        },
        detail: createPageBody(sections),
      })}
    />
  );
}
