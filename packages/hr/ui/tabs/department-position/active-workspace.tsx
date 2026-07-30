"use client";

import { PageSurface, type BodySurfaceSectionSpec, type PageSurfaceCreateSpec, type PageSurfaceToolbarSpec, type SelectorSurfaceProps } from "@workspace/core/ui";
import { createCategoryItemDetailBody } from "@workspace/platform/ui";
import type { RosterSurfaceTabBarProps } from "../../roster-surface";
import type { Department } from "./types";

export function DepartmentPositionActiveWorkspace({
  sections,
  create,
  selector,
  surface,
  toolbarItems,
}: {
  sections: BodySurfaceSectionSpec[];
  create: PageSurfaceCreateSpec;
  selector: SelectorSurfaceProps<Department>;
  surface?: RosterSurfaceTabBarProps;
  toolbarItems?: PageSurfaceToolbarSpec["items"];
}) {
  const toolbar = toolbarItems?.length ? { variant: "bar" as const, items: toolbarItems } : undefined;

  return (
    <PageSurface kind="standard"
      {...surface}
      create={create}
      toolbar={toolbar}
      body={createCategoryItemDetailBody({
        category: {
          label: "组织岗位",
          selector,
        },
        detailSections: sections,
      })}
    />
  );
}
