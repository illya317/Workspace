"use client";

import { useMemo, useRef } from "react";
import { joinClassNames } from "./card-utils";
import { TOOLBAR_GAP } from "./interactionTokens";
import type { ToolbarProps } from "./Toolbar.types";
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
  onSubmit,
}: ToolbarProps) {
  const size = "md";
  const layoutMode = "auto";
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

  const content = (
    <div ref={containerRef} className="relative w-full min-w-0 overflow-visible">
      {renderToolbarContent(grouped, resolvedLayoutMode, size, gapClass)}
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
