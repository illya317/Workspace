"use client";

import { joinClassNames } from "../common/card-utils";
import type { ControlSize } from "../common/interactionTokens";
import { getToolbarItemActionOrder, ToolbarDivider, ToolbarItemRenderer } from "./Toolbar.parts";
import { inferZone, resolveSection } from "./Toolbar.sections";
import type { ToolbarItem, ToolbarLayoutMode, ToolbarSection, ToolbarZoneKey } from "./Toolbar.types";

export const SECTION_ORDER: ToolbarSection[] = ["primary", "search", "filter", "edit", "action", "meta", "view"];

type SectionWithItems = { key: ToolbarSection; items: ToolbarItem[] };
export type ToolbarGroupedItems = Record<ToolbarZoneKey, ToolbarItem[]>;

export function groupToolbarItems(items: ToolbarItem[]): ToolbarGroupedItems {
  const result: ToolbarGroupedItems = {
    lead: [],
    search: [],
    filter: [],
    actions: [],
    trailing: [],
  };
  for (const item of items) {
    result[inferZone(item)].push(item);
  }
  return result;
}

export function buildSections(source: ToolbarItem[]): SectionWithItems[] {
  const sections = new Map<ToolbarSection, ToolbarItem[]>();
  for (const item of source) {
    const section: ToolbarSection = resolveSection(item);
    const list = sections.get(section) ?? [];
    list.push(item);
    sections.set(section, list);
  }
  return SECTION_ORDER
    .map((key) => {
      const items = sections.get(key) ?? [];
      const sorted = [...items].sort((a, b) => {
        if (a.kind === "text" && b.kind !== "text") return -1;
        if (a.kind !== "text" && b.kind === "text") return 1;
        if ((key === "edit" || key === "action") && a.kind !== "text" && b.kind !== "text") {
          return getToolbarItemActionOrder(a) - getToolbarItemActionOrder(b);
        }
        return 0;
      });
      return { key, items: sorted };
    })
    .filter((section) => section.items.length > 0);
}

function renderSectionGroup(
  sections: SectionWithItems[],
  size: ControlSize,
  gapClass: string,
) {
  return sections.map((section) => (
    <div
      key={section.key}
      className={joinClassNames("flex shrink-0 items-center", gapClass)}
    >
      {section.items.map((item) => (
        <ToolbarItemRenderer key={item.key} item={item} size={size} />
      ))}
    </div>
  ));
}

function hasSections(sections: SectionWithItems[]) {
  return sections.some((section) => section.items.length > 0);
}

function ZoneGroup({
  sections,
  size,
  gapClass,
  className = "",
  overflow = "visible",
}: {
  sections: SectionWithItems[];
  size: ControlSize;
  gapClass: string;
  className?: string;
  overflow?: "visible" | "hidden";
}) {
  if (!hasSections(sections)) return null;
  return (
    <div className={joinClassNames(
      "flex min-w-0 flex-nowrap items-center gap-3",
      overflow === "hidden" ? "overflow-hidden" : "overflow-visible",
      className,
    )}>
      {renderSectionGroup(sections, size, gapClass)}
    </div>
  );
}

export function CompactToolbarContent({
  grouped,
  size,
  gapClass,
}: {
  grouped: ToolbarGroupedItems;
  size: ControlSize;
  gapClass: string;
}) {
  const leadSections = buildSections(grouped.lead);
  const searchSections = buildSections(grouped.search);
  const filterSections = buildSections(grouped.filter);
  const actionSections = buildSections(grouped.actions);
  const trailingSections = buildSections(grouped.trailing);
  const metaSections = trailingSections.filter((section) => section.key === "meta");
  const otherTrailingSections = trailingSections.filter((section) => section.key !== "meta");

  const hasLead = hasSections(leadSections);
  const hasSearchOrFilter = hasSections(searchSections) || hasSections(filterSections);
  const hasActions = hasSections(actionSections);
  const hasTrailing = hasSections(metaSections) || hasSections(otherTrailingSections);

  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-3 overflow-visible">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-3 overflow-visible">
        <ZoneGroup sections={leadSections} size={size} gapClass={gapClass} className="shrink-0" />
        {hasLead && hasSearchOrFilter && <ToolbarDivider />}
        <ZoneGroup sections={searchSections} size={size} gapClass={gapClass} className="shrink" />
        <ZoneGroup sections={filterSections} size={size} gapClass={gapClass} className="shrink" />
        {hasSearchOrFilter && hasActions && <ToolbarDivider />}
        <ZoneGroup sections={actionSections} size={size} gapClass={gapClass} className="shrink-0" />
      </div>
      {hasTrailing && (
        <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-3 overflow-visible">
          <ZoneGroup sections={metaSections} size={size} gapClass={gapClass} className="shrink-0" />
          {hasSections(metaSections) && hasSections(otherTrailingSections) && <ToolbarDivider />}
          <ZoneGroup sections={otherTrailingSections} size={size} gapClass={gapClass} className="shrink-0" />
        </div>
      )}
    </div>
  );
}

function SplitToolbarContent({
  grouped,
  size,
  gapClass,
}: {
  grouped: ToolbarGroupedItems;
  size: ControlSize;
  gapClass: string;
}) {
  const leadSections = buildSections(grouped.lead);
  const searchSections = buildSections(grouped.search);
  const filterSections = buildSections(grouped.filter);
  const actionSections = buildSections(grouped.actions);
  const trailingSections = buildSections(grouped.trailing);
  const metaSections = trailingSections.filter((section) => section.key === "meta");
  const otherTrailingSections = trailingSections.filter((section) => section.key !== "meta");

  const hasLead = hasSections(leadSections);
  const hasFilter = hasSections(filterSections);
  const hasSearch = hasSections(searchSections);
  const hasActions = hasSections(actionSections);
  const hasTrailing = hasSections(metaSections) || hasSections(otherTrailingSections);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 overflow-visible">
      <div className="flex w-full min-w-0 flex-nowrap items-center gap-3 overflow-visible">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-3 overflow-visible">
          <ZoneGroup sections={leadSections} size={size} gapClass={gapClass} className="shrink-0" />
          {hasLead && hasFilter && <ToolbarDivider />}
          <ZoneGroup sections={filterSections} size={size} gapClass={gapClass} className="shrink" />
        </div>
      </div>
      <div className="flex w-full min-w-0 flex-nowrap items-center gap-3 overflow-visible">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-3 overflow-visible">
          <ZoneGroup sections={searchSections} size={size} gapClass={gapClass} className="shrink" />
          {hasSearch && hasActions && <ToolbarDivider />}
          <ZoneGroup sections={actionSections} size={size} gapClass={gapClass} className="shrink-0" />
        </div>
        {hasTrailing && (
          <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-3 overflow-visible">
            <ZoneGroup sections={metaSections} size={size} gapClass={gapClass} className="shrink-0" />
            {hasSections(metaSections) && hasSections(otherTrailingSections) && <ToolbarDivider />}
            <ZoneGroup sections={otherTrailingSections} size={size} gapClass={gapClass} className="shrink-0" />
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolbarLayoutBody({
  grouped,
  mode,
  size,
  gapClass,
}: {
  grouped: ToolbarGroupedItems,
  mode: Exclude<ToolbarLayoutMode, "auto">,
  size: ControlSize,
  gapClass: string;
}) {
  if (mode === "split") {
    return <SplitToolbarContent grouped={grouped} size={size} gapClass={gapClass} />;
  }
  return <CompactToolbarContent grouped={grouped} size={size} gapClass={gapClass} />;
}

export function renderToolbarContent(
  grouped: ToolbarGroupedItems,
  mode: Exclude<ToolbarLayoutMode, "auto">,
  size: ControlSize,
  gapClass: string,
) {
  return <ToolbarLayoutBody grouped={grouped} mode={mode} size={size} gapClass={gapClass} />;
}

export function renderCompactToolbarMeasurement(
  grouped: ToolbarGroupedItems,
  size: ControlSize,
  gapClass: string,
) {
  return (
    <div className="w-max">
      <CompactToolbarContent grouped={grouped} size={size} gapClass={gapClass} />
    </div>
  );
}
