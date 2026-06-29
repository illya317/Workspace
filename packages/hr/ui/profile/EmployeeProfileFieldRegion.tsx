"use client";

import type { ReactNode, Ref } from "react";
import {
  createPageBody,
  createPanelSection,
  PageSurface,
  type PageSurfaceSectionSpec,
  type PageSurfaceCommandSpec,
} from "@workspace/core/ui";

export function FieldRegion({
  title,
  actions,
  sections,
}: {
  title: ReactNode;
  actions?: PageSurfaceCommandSpec[];
  sections: PageSurfaceSectionSpec[];
  className?: string;
}) {
  const block = fieldRegionBlock({ title, actions, sections });
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([block])}
    />
  );
}

export function fieldRegionBlock({
  title,
  actions,
  sections,
  itemRef,
  key = "field-region",
}: {
  title: ReactNode;
  actions?: PageSurfaceCommandSpec[];
  sections: PageSurfaceSectionSpec[];
  itemRef?: Ref<HTMLDivElement>;
  key?: string;
}): PageSurfaceSectionSpec {
  return createPanelSection(key, {
    itemRef,
    title,
    actions,

    sections,
  });
}
