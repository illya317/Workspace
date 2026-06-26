"use client";

import { useMemo } from "react";
import type { ControlSize } from "./interactionTokens";
import { ToolbarItemRenderer } from "./Toolbar.parts";
import type { ToolbarItem, ToolbarLayoutMode, ToolbarZoneKey } from "./Toolbar.types";
import { useHiddenToolbarItems } from "./Toolbar.visibility";
import { buildSections, CompactToolbarContent, type ToolbarGroupedItems } from "./Toolbar.layout";

const ZONE_ORDER: ToolbarZoneKey[] = ["lead", "search", "filter", "actions", "trailing"];

function emptyGroupedItems(): ToolbarGroupedItems {
  return {
    lead: [],
    search: [],
    filter: [],
    actions: [],
    trailing: [],
  };
}

function orderedHiddenItems(grouped: ToolbarGroupedItems): ToolbarItem[] {
  return ZONE_ORDER.flatMap((zone) => {
    const sections = buildSections(grouped[zone]);
    return sections.flatMap((section) => section.items);
  });
}

function filterGroupedItems(grouped: ToolbarGroupedItems, visibleKeys: Set<string>): ToolbarGroupedItems {
  return {
    lead: grouped.lead.filter((item) => visibleKeys.has(item.key)),
    search: grouped.search.filter((item) => visibleKeys.has(item.key)),
    filter: grouped.filter.filter((item) => visibleKeys.has(item.key)),
    actions: grouped.actions.filter((item) => visibleKeys.has(item.key)),
    trailing: grouped.trailing.filter((item) => visibleKeys.has(item.key)),
  };
}

function HiddenToolbarRow({
  grouped,
  size,
  gapClass,
}: {
  grouped: ToolbarGroupedItems;
  size: ControlSize;
  gapClass: string;
}) {
  const orderedItems = useMemo(() => orderedHiddenItems(grouped), [grouped]);
  const itemKeys = useMemo(() => orderedItems.map((item) => item.key), [orderedItems]);
  const { containerRef, itemRefs, visibleKeys } = useHiddenToolbarItems(itemKeys);
  const visibleGrouped = useMemo(() => filterGroupedItems(grouped, visibleKeys), [grouped, visibleKeys]);

  return (
    <div ref={containerRef} className="relative w-full min-w-0 overflow-visible">
      <CompactToolbarContent grouped={visibleGrouped} size={size} gapClass={gapClass} />
      <div aria-hidden="true" className="invisible pointer-events-none absolute left-0 top-0 flex w-max flex-nowrap items-center gap-3">
        {orderedItems.map((item) => (
          <span
            key={item.key}
            ref={(node) => {
              if (node) itemRefs.current.set(item.key, node);
              else itemRefs.current.delete(item.key);
            }}
            className="shrink-0"
          >
            <ToolbarItemRenderer item={item} size={size} />
          </span>
        ))}
      </div>
    </div>
  );
}

export function HiddenToolbarContent({
  grouped,
  mode,
  size,
  gapClass,
}: {
  grouped: ToolbarGroupedItems;
  mode: Exclude<ToolbarLayoutMode, "auto">;
  size: ControlSize;
  gapClass: string;
}) {
  if (mode !== "split") {
    return <HiddenToolbarRow grouped={grouped} size={size} gapClass={gapClass} />;
  }

  const row1Grouped = emptyGroupedItems();
  row1Grouped.lead = grouped.lead;
  row1Grouped.filter = grouped.filter;

  const row2Grouped = emptyGroupedItems();
  row2Grouped.search = grouped.search;
  row2Grouped.actions = grouped.actions;
  row2Grouped.trailing = grouped.trailing;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 overflow-visible">
      <HiddenToolbarRow grouped={row1Grouped} size={size} gapClass={gapClass} />
      <HiddenToolbarRow grouped={row2Grouped} size={size} gapClass={gapClass} />
    </div>
  );
}
