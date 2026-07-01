"use client";

import {
  createBodySplitSection,
  createPageTabsNavigation,
  type BodySurfaceProps,
  type BodySurfaceSelectorProps,
  type PageSurfaceNavigationSpec,
  type SurfaceToolbarItem,
} from "@workspace/core/ui";

export type SpaceWorkbenchKindOption = {
  key: string;
  label: string;
  disabled?: boolean;
};

export function createSpaceKindNavigation({
  items,
  active,
  onChange,
  label = "空间",
  ariaLabel = "空间类型",
}: {
  items: SpaceWorkbenchKindOption[];
  active: string;
  onChange: (key: string) => void;
  label?: string;
  ariaLabel?: string;
}): PageSurfaceNavigationSpec {
  return createPageTabsNavigation({
    items: items.map((item) => ({ key: item.key, label: item.label })),
    active,
    onChange,
    label,
    variant: "large",
    ariaLabel,
  });
}

export function createSpaceViewToolbarItem({
  key = "space-view",
  value,
  options,
  onChange,
  ariaLabel = "当前视图",
}: {
  key?: string;
  value: string;
  options: SpaceWorkbenchKindOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}): SurfaceToolbarItem {
  return {
    kind: "option-group",
    key,
    value,
    options: options.map((option) => ({
      value: option.key,
      label: option.label,
      disabled: option.disabled,
    })),
    presentation: "segmented",
    onChange,
    ariaLabel,
  };
}

export function createSpaceWorkbenchBody({
  left,
  right,
  label,
  open,
  drawerOpen,
  onOpenChange,
  onDrawerOpenChange,
  ratio = [0.28, 0.72],
  showControls = true,
}: {
  left: BodySurfaceSelectorProps;
  right: BodySurfaceProps;
  label: string;
  open: boolean;
  drawerOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  ratio?: [number, number];
  showControls?: boolean;
}): BodySurfaceProps {
  return createBodySplitSection({
    left,
    drawerLeft: left,
    right,
    side: {
      label,
      open,
      drawerOpen,
      onOpenChange,
      onDrawerOpenChange,
      showControls,
    },
    layout: { ratio },
  });
}
