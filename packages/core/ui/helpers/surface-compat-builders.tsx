"use client";

import CreatePanel, { type CreatePanelBlockProps } from "../internal/create/CreatePanel";
import SelectorPanel, { type SelectorPanelProps } from "../internal/selection/SelectorPanel";
import type { PageSurfaceSectionSpec } from "../PageSurface.types";

type BlockSurfaceSectionSpec = Extract<PageSurfaceSectionSpec, { kind: "block" }>;

export type CreatePanelSectionHelperProps = Omit<CreatePanelBlockProps, "variant">;

export function createCreatePanelSection(
  key: string,
  props: CreatePanelSectionHelperProps,
): BlockSurfaceSectionSpec {
  return {
    kind: "block",
    key,
    surface: {
      kind: "content",
      content: <CreatePanel variant="block" {...props} />,
    },
  };
}

export type SelectorPanelSectionHelperOptions = Record<string, never>;

export function createSelectorPanelSection<T>(
  key: string,
  props: SelectorPanelProps<T>,
  _options: SelectorPanelSectionHelperOptions = {},
): BlockSurfaceSectionSpec {
  return {
    kind: "block",
    key,
    surface: {
      kind: "content",
      content: <SelectorPanel<T> {...props} />,
    },
  };
}
