"use client";

import Pagination from "./internal/common/Pagination";
import TabBar, { type TabBarProps, type TabDef } from "./internal/common/TabBar";
import NavigationSelectorTrigger from "./internal/common/NavigationSelectorTrigger";
import type { NavigationSurfaceSelectorSpec } from "./NavigationSurface.types";
import type { PageSurfaceTabBarItemSpec, PageSurfaceTabBarSpec } from "./PageSurface.types";
import type { SurfacePaginationSpec } from "./SurfaceContractTypes";

interface NavigationSurfacePaginationProps {
  kind: "pagination";
  pagination: SurfacePaginationSpec;
}

interface NavigationSurfaceContextSelectorProps {
  kind: "context-selector";
  selector: NavigationSurfaceSelectorSpec;
}

type NavigationSurfaceProps =
  | PageSurfaceTabBarSpec
  | NavigationSurfacePaginationProps
  | NavigationSurfaceContextSelectorProps;

function toTabDef(item: PageSurfaceTabBarItemSpec): TabDef {
  return {
    key: item.key,
    label: item.label,
    compactLabel: item.compactLabel,
    children: item.children?.map(toTabDef),
  };
}

function renderTabs(props: PageSurfaceTabBarSpec) {
  const tabs = props.items.map(toTabDef);
  const hasChildren = props.items.some((item) => item.children?.length);
  const tabProps: TabBarProps = hasChildren
    ? {
        tabs,
        active: props.active,
        activeChild: props.activeChild,
        onChange: props.onChange,
        onChildChange: props.onChildChange,
        accordion: true,
        variant: props.variant ?? "large",
        ariaLabel: props.ariaLabel,
      }
    : {
        tabs,
        active: props.active,
        onChange: props.onChange,
        variant: props.variant ?? "large",
        ariaLabel: props.ariaLabel,
      };
  return <TabBar {...tabProps} />;
}

export default function NavigationSurface(props: NavigationSurfaceProps) {
  if (props.kind === "tabs") return renderTabs(props);
  if (props.kind === "context-selector") return <NavigationSelectorTrigger selector={props.selector} />;
  return <Pagination {...props.pagination} />;
}
