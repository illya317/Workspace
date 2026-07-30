"use client";

import { useMemo, useRef } from "react";
import { joinClassNames } from "./internal/common/card-utils";
import { TOOLBAR_GAP } from "./internal/common/interactionTokens";
import type { ToolbarProps } from "./internal/toolbar/Toolbar.types";
import { usePageAssistant } from "./services/PageAssistantProvider";
import {
  groupToolbarItems,
  renderToolbarContent,
  renderCompactToolbarMeasurement,
} from "./internal/toolbar/Toolbar.layout";
import MobileToolbarContent from "./internal/toolbar/Toolbar.mobile";
import { useAutoToolbarLayout } from "./internal/toolbar/Toolbar.visibility";

export type {
  ToolbarSection,
  ToolbarItem,
  ToolbarProps,
  ToolbarZoneKey,
  ToolbarLayoutMode,
  ToolbarVisibility,
  ToolbarIconButtonItem,
  ToolbarPanelToggleItem,
  ToolbarSearchItem,
  ToolbarSelectItem,
  ToolbarGroupedSelectItem,
  ToolbarOptionGroupItem,
  ToolbarFieldFilterItem,
  ToolbarFilterPanelItem,
  ToolbarFilterPanelFieldSpec,
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
} from "./internal/toolbar/Toolbar.types";

export { SECTION_ORDER } from "./internal/toolbar/Toolbar.layout";

export function Toolbar({
  items,
  onSubmit,
  defaultAssistant,
}: ToolbarProps) {
  assertSingleSearchItem(items);
  const size = "md";
  const layoutMode = "auto";
  const gapClass = TOOLBAR_GAP[size];
  const containerRef = useRef<HTMLDivElement>(null);
  const compactMeasureRef = useRef<HTMLDivElement>(null);
  const pageAssistant = usePageAssistant();

  const resolvedItems = useMemo(() => {
    if (!defaultAssistant || !pageAssistant.enabled || hasAssistantItem(items)) return items;
    return [
      ...items,
      {
        kind: "action-group" as const,
        key: "page-assistant",
        actions: [{
          key: "assistant",
          kind: "assistant" as const,
          label: "页面助手",
          onClick: () => pageAssistant.openAssistant({
            contextLabel: defaultAssistant.contextLabel,
            path: typeof window === "undefined" ? undefined : window.location.pathname,
            title: typeof document === "undefined" ? undefined : document.title,
            sourceContext: defaultAssistant.sourceContext,
          }),
        }],
      },
    ];
  }, [defaultAssistant, items, pageAssistant]);

  const mobileGrouped = useMemo(() => groupToolbarItems(resolvedItems, "mobile"), [resolvedItems]);
  const desktopGrouped = useMemo(() => groupToolbarItems(resolvedItems, "desktop"), [resolvedItems]);
  const autoMode = useAutoToolbarLayout({
    enabled: layoutMode === "auto",
    containerRef,
    compactMeasureRef,
  });
  const resolvedLayoutMode = layoutMode === "auto" ? autoMode : layoutMode;

  const content = (
    <div ref={containerRef} className="relative w-full min-w-0 overflow-visible">
      <div className="sm:hidden">
        <MobileToolbarContent grouped={mobileGrouped} size={size} onSubmit={onSubmit} />
      </div>
      <div className="hidden sm:block">
        {renderToolbarContent(desktopGrouped, resolvedLayoutMode, size, gapClass)}
      </div>
      {layoutMode === "auto" && (
        <div
          ref={compactMeasureRef}
          aria-hidden="true"
          className="invisible pointer-events-none absolute left-0 top-0 max-w-full overflow-hidden"
        >
          {renderCompactToolbarMeasurement(desktopGrouped, size, gapClass)}
        </div>
      )}
    </div>
  );

  const barClassName = joinClassNames(
    "relative z-20 flex min-h-14 items-center overflow-visible rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:rounded-lg sm:p-3",
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

function hasAssistantItem(items: ToolbarProps["items"]) {
  return items.some((item) => {
    if (item.kind === "icon-button") return item.icon === "assistant" || item.key === "assistant";
    if (item.kind !== "action-group") return item.key === "assistant";
    return item.key === "assistant" || item.actions.some((action) => action.kind === "assistant" || action.key === "assistant");
  });
}

function assertSingleSearchItem(items: ToolbarProps["items"]) {
  const searchCount = items.filter((item) => item.kind === "search").length;
  if (searchCount > 1) {
    throw new Error("Toolbar 只允许声明一个 search；请合并为页面级搜索或改用结构化筛选。");
  }
}
