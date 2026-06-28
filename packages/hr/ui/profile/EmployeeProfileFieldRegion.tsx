"use client";

import type { ReactNode, Ref } from "react";
import {
  createPanelBlock,
  PageSurface,
  type PageSurfaceBlockSpec,
  type PageSurfaceCommandSpec,
} from "@workspace/core/ui";

export function FieldRegion({
  title,
  actions,
  blocks,
  className = "",
}: {
  title: ReactNode;
  actions?: PageSurfaceCommandSpec[];
  blocks: PageSurfaceBlockSpec[];
  className?: string;
}) {
  const block = fieldRegionBlock({ title, actions, blocks });
  return (
    <PageSurface
      embedded
      kind="detail"
      className={className}
      blocks={[block]}
    />
  );
}

export function fieldRegionBlock({
  title,
  actions,
  blocks,
  itemRef,
  key = "field-region",
}: {
  title: ReactNode;
  actions?: PageSurfaceCommandSpec[];
  blocks: PageSurfaceBlockSpec[];
  itemRef?: Ref<HTMLDivElement>;
  key?: string;
}): PageSurfaceBlockSpec {
  return createPanelBlock(key, {
    itemRef,
    title,
    actions,
    bodyClassName: "p-3",
    blocks,
  });
}
