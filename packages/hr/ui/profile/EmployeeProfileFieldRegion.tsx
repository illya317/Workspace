"use client";

import type { ReactNode, Ref } from "react";
import {
  createPageBody,
  createPanelSection,
  PageSurface,
  type BodySurfaceSectionSpec,
  type BodySurfaceCommandSpec,
} from "@workspace/core/ui";

export function FieldRegion({
  title,
  actions,
  sections,
}: {
  title: ReactNode;
  actions?: BodySurfaceCommandSpec[];
  sections: BodySurfaceSectionSpec[];
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
  actions?: BodySurfaceCommandSpec[];
  sections: BodySurfaceSectionSpec[];
  itemRef?: Ref<HTMLDivElement>;
  key?: string;
}): BodySurfaceSectionSpec {
  return createPanelSection(key, {
    itemRef,
    title,
    actions,

    sections,
  });
}
