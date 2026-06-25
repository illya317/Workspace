"use client";

import { joinClassNames } from "./card-utils";
import { getToolbarItemActionOrder, inferSection, ToolbarDivider, ToolbarItemRenderer } from "./Toolbar.parts";
import type { ToolbarItem, ToolbarProps, ToolbarSection } from "./Toolbar.types";

export type {
  ToolbarSection,
  ToolbarItem,
  ToolbarProps,
  ToolbarIconButtonItem,
  ToolbarSearchItem,
  ToolbarSelectItem,
  ToolbarOptionGroupItem,
  ToolbarFieldFilterItem,
  ToolbarColumnToggleItem,
  ToolbarTextItem,
  ToolbarCustomItem,
  ToolbarActionGroupItem,
  ToolbarActionGroupAction,
  ToolbarEditGroupItem,
  ToolbarCreateItem,
} from "./Toolbar.types";

export const SECTION_ORDER: ToolbarSection[] = ["view", "search", "filter", "edit", "action", "meta"];

export function Toolbar({ items, className = "", onSubmit, variant = "bar" }: ToolbarProps) {
  if (variant === "inline") {
    const inlineClassName = joinClassNames("flex flex-wrap items-center gap-2", className);
    const renderedItems = items.map((item) => <ToolbarItemRenderer key={item.key} item={item} />);
    if (onSubmit) {
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className={inlineClassName}
        >
          {renderedItems}
        </form>
      );
    }
    return <div className={inlineClassName}>{renderedItems}</div>;
  }

  const sections = new Map<ToolbarSection, ToolbarItem[]>();
  for (const item of items) {
    const section: ToolbarSection = item.kind === "search" ? "search" : (item.section ?? inferSection(item));
    const list = sections.get(section) ?? [];
    list.push(item);
    sections.set(section, list);
  }

  const orderedSections = SECTION_ORDER.map((key) => ({
    key,
    items: sections.get(key) ?? [],
  })).filter((section) => section.items.length > 0);

  const metaSection = orderedSections.find((section) => section.key === "meta");
  const nonMetaSections = orderedSections.filter((section) => section.key !== "meta");

  const renderSection = (section: { key: ToolbarSection; items: ToolbarItem[] }, sectionIndex: number) => {
    const items = section.key === "edit" || section.key === "action"
      ? [...section.items].sort((a, b) => getToolbarItemActionOrder(a) - getToolbarItemActionOrder(b))
      : section.items;
    return (
      <div key={section.key} className="flex min-h-10 min-w-0 flex-wrap items-center gap-2">
        {sectionIndex > 0 && <ToolbarDivider />}
        {items.map((item) => (
          <ToolbarItemRenderer key={item.key} item={item} />
        ))}
      </div>
    );
  };

  const content = (
    <>
      {nonMetaSections.map((section, index) => renderSection(section, index))}
      {metaSection && <div className="min-w-4 flex-1 basis-4" />}
      {metaSection && renderSection(metaSection, nonMetaSections.length)}
    </>
  );

  const barClassName = joinClassNames(
    "relative z-20 flex min-h-14 flex-wrap items-center gap-3 overflow-visible rounded-lg border border-slate-200 bg-white p-3 shadow-sm",
    className,
  );

  if (onSubmit) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className={barClassName}
      >
        {content}
      </form>
    );
  }

  return <div className={barClassName}>{content}</div>;
}

export default Toolbar;
