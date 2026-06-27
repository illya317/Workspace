"use client";

import { useMemo, useRef } from "react";
import { joinClassNames } from "./card-utils";
import { TOOLBAR_GAP } from "./interactionTokens";
import type { ToolbarProps } from "./Toolbar.types";
import { ToolbarItemRenderer } from "./Toolbar.parts";
import { HiddenToolbarContent } from "./Toolbar.hidden";
import {
  groupToolbarItems,
  renderToolbarContent,
  renderCompactToolbarMeasurement,
} from "./Toolbar.layout";
import { useAutoToolbarLayout } from "./Toolbar.visibility";

export type {
  ToolbarSection,
  ToolbarItem,
  ToolbarProps,
  ToolbarZoneKey,
  ToolbarLayoutMode,
  ToolbarIconButtonItem,
  ToolbarPanelToggleItem,
  ToolbarSearchItem,
  ToolbarSelectItem,
  ToolbarOptionGroupItem,
  ToolbarFieldFilterItem,
  ToolbarColumnToggleItem,
  ToolbarPageSizeItem,
  ToolbarPeriodItem,
  ToolbarTextItem,
  ToolbarMenuItem,
  ToolbarMenuTriggerSpec,
  ToolbarMenuActionItem,
  ToolbarActionGroupItem,
  ToolbarActionGroupAction,
  ToolbarEditGroupItem,
  ToolbarCreateItem,
} from "./Toolbar.types";

export { SECTION_ORDER } from "./Toolbar.layout";

export function Toolbar({
  items,
  className = "",
  onSubmit,
  variant = "bar",
  size = "md",
  layoutMode = "auto",
  hideOverflowItems = false,
  enableVisibility = false,
}: ToolbarProps & { enableVisibility?: boolean }) {
  const gapClass = TOOLBAR_GAP[size];
  const containerRef = useRef<HTMLDivElement>(null);
  const compactMeasureRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => groupToolbarItems(items), [items]);
  const autoMode = useAutoToolbarLayout({
    enabled: layoutMode === "auto",
    containerRef,
    compactMeasureRef,
  });
  const resolvedLayoutMode = layoutMode === "auto" ? autoMode : layoutMode;
  const shouldHideOverflowItems = hideOverflowItems || enableVisibility;

  if (variant === "inline") {
    const inlineClassName = joinClassNames("flex flex-wrap items-center", gapClass, className);
    const renderedItems = items.map((item) => <ToolbarItemRenderer key={item.key} item={item} size={size} />);
    if (onSubmit) {
      return (
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className={inlineClassName}>
          {renderedItems}
        </form>
      );
    }
    return <div className={inlineClassName}>{renderedItems}</div>;
  }

  const content = (
    <div ref={containerRef} className="relative w-full min-w-0 overflow-visible">
      {shouldHideOverflowItems
        ? <HiddenToolbarContent grouped={grouped} mode={resolvedLayoutMode} size={size} gapClass={gapClass} />
        : renderToolbarContent(grouped, resolvedLayoutMode, size, gapClass)}
      {layoutMode === "auto" && (
        <div
          ref={compactMeasureRef}
          aria-hidden="true"
          className="invisible pointer-events-none absolute left-0 top-0 w-max"
        >
          {renderCompactToolbarMeasurement(grouped, size, gapClass)}
        </div>
      )}
    </div>
  );

  const barClassName = joinClassNames(
    "relative z-20 flex min-h-14 items-center overflow-visible rounded-lg border border-slate-200 bg-white p-3 shadow-sm",
    className,
  );

  if (onSubmit) {
    return (
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className={barClassName}>
        {content}
      </form>
    );
  }

  return <div className={barClassName}>{content}</div>;
}

export default Toolbar;
