"use client";

import {
  createBodySplitSection,
  createPageTabsNavigation,
  type BodySurfaceProps,
  type BodySurfaceSelectorProps,
  type PageSurfaceNavigationSpec,
  type SurfaceToolbarItem,
  type SurfaceToolbarItems,
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
  ariaLabel = "空间类型",
}: {
  items: SpaceWorkbenchKindOption[];
  active: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
}): PageSurfaceNavigationSpec {
  return createPageTabsNavigation({
    items: items.map((item) => ({ key: item.key, label: item.label })),
    active,
    onChange,
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

export function spaceWorkbenchPanelToolbarItems({
  label,
  open,
  onOpenDrawer,
  onToggleSide,
  mobileKey = "mobile-side-toggle",
  desktopKey = "desktop-side-toggle",
}: {
  label: string;
  open: boolean;
  onOpenDrawer: () => void;
  onToggleSide: () => void;
  mobileKey?: string;
  desktopKey?: string;
}): SurfaceToolbarItems {
  return [
    {
      kind: "panel-toggle",
      key: mobileKey,
      icon: "panel-open",
      label: `显示${label}`,
      visibility: "mobile",
      onClick: onOpenDrawer,
    },
    {
      kind: "panel-toggle",
      key: desktopKey,
      icon: open ? "panel-close" : "panel-open",
      label: `${open ? "隐藏" : "显示"}${label}`,
      variant: open ? "primary" : "secondary",
      visibility: "desktop",
      onClick: onToggleSide,
    },
  ];
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
