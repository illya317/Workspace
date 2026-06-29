"use client";

import BodySurface, { renderBodyEmpty, type BodySurfaceSectioningSpec, type BodySurfaceSectionSpec } from "../../BodySurface";
import { Toolbar } from "../../Toolbar";
import type { PageSurfaceToolbarSpec } from "../../PageSurface.types";

export function renderToolbar(toolbar?: PageSurfaceToolbarSpec) {
  if (!toolbar?.items.length) return null;
  return <Toolbar {...toolbar} />;
}

export const renderEmpty = renderBodyEmpty;

export function PageSurfaceSectionStack({
  sections,
  sectioning,
  layout = "stack",
}: {
  sections?: BodySurfaceSectionSpec[];
  sectioning?: BodySurfaceSectioningSpec;
  layout?: "stack" | "grid";
}) {
  return <BodySurface kind="section" sections={sections} sectioning={sectioning} layout={layout} />;
}
