"use client";

import type { ReactNode, Ref } from "react";
import {
  createPanelSection,
  type BodySurfaceSectionSpec,
  type BodySurfaceCommandSpec,
} from "@workspace/core/ui";

export function createFieldRegionSection({
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
