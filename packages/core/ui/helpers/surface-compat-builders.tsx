"use client";

import CreatePanel, { type CreatePanelBlockProps } from "../internal/create/CreatePanel";
import SelectorPanel, { type SelectorPanelProps } from "../internal/selection/SelectorPanel";
import type { PageSurfaceSectionSpec } from "../PageSurface.types";

export type CreatePanelSectionHelperProps = Omit<CreatePanelBlockProps, "variant">;

export function createCreatePanelSection(
  key: string,
  props: CreatePanelSectionHelperProps,
): PageSurfaceSectionSpec {
  return {
    key,
    body: {
      kind: "section",
      surface: {
        kind: "content",
        content: <CreatePanel variant="block" {...props} />,
      },
    },
  };
}

export type SelectorPanelSectionHelperOptions = Record<string, never>;

export function createSelectorPanelSection<T>(
  key: string,
  props: SelectorPanelProps<T>,
  _options: SelectorPanelSectionHelperOptions = {},
): PageSurfaceSectionSpec {
  return {
    key,
    body: {
      kind: "section",
      surface: {
        kind: "content",
        content: <SelectorPanel<T> {...props} />,
      },
    },
  };
}
