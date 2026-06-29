"use client";

import type { BlockSurfaceProps } from "../BlockSurface";
import CreatePanel, { type CreatePanelBlockProps } from "../internal/create/CreatePanel";
import SelectorPanel, { type SelectorPanelProps } from "../internal/selection/SelectorPanel";
import type { PageSurfaceBlockSpec } from "../PageSurface.types";

type BlockSurfaceBlockSpec = Extract<PageSurfaceBlockSpec, { kind: "block" }>;

export type CreatePanelBlockHelperProps = Omit<CreatePanelBlockProps, "variant"> & {
  blockClassName?: string;
};

export function createCreatePanelBlock(
  key: string,
  props: CreatePanelBlockHelperProps,
): BlockSurfaceBlockSpec {
  const { blockClassName, ...panelProps } = props;
  return {
    kind: "block",
    key,
    surface: {
      kind: "content",
      className: blockClassName,
      content: <CreatePanel variant="block" {...panelProps} />,
    },
  };
}

export type SelectorPanelBlockHelperOptions = {
  blockClassName?: string;
};

export function createSelectorPanelBlock<T>(
  key: string,
  props: SelectorPanelProps<T>,
  options: SelectorPanelBlockHelperOptions = {},
): BlockSurfaceBlockSpec {
  return {
    kind: "block",
    key,
    surface: {
      kind: "content",
      className: options.blockClassName,
      content: <SelectorPanel<T> {...props} />,
    } satisfies BlockSurfaceProps,
  };
}
