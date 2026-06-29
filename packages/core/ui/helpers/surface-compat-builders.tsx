"use client";

import CreatePanel, { type CreatePanelBlockProps } from "../internal/create/CreatePanel";
import SelectorPanel, { type SelectorPanelProps } from "../internal/selection/SelectorPanel";
import type { PageSurfaceBlockSpec } from "../PageSurface.types";

type BlockSurfaceBlockSpec = Extract<PageSurfaceBlockSpec, { kind: "block" }>;

export type CreatePanelBlockHelperProps = Omit<CreatePanelBlockProps, "variant">;

export function createCreatePanelBlock(
  key: string,
  props: CreatePanelBlockHelperProps,
): BlockSurfaceBlockSpec {
  return {
    kind: "block",
    key,
    surface: {
      kind: "content",
      content: <CreatePanel variant="block" {...props} />,
    },
  };
}

export type SelectorPanelBlockHelperOptions = Record<string, never>;

export function createSelectorPanelBlock<T>(
  key: string,
  props: SelectorPanelProps<T>,
  _options: SelectorPanelBlockHelperOptions = {},
): BlockSurfaceBlockSpec {
  return {
    kind: "block",
    key,
    surface: {
      kind: "content",
      content: <SelectorPanel<T> {...props} />,
    },
  };
}
