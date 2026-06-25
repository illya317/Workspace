"use client";

import type { ReactNode } from "react";
import { ActionButton, IconActionButton } from "./ActionControls";
import type { ActionGlyphKind } from "./ActionGlyphs";
import ColumnToggle, { type ColumnDef } from "./ColumnToggle";
import { joinClassNames } from "./card-utils";
import SearchInput from "./SearchInput";
import SelectField, { type SelectFieldOption } from "./SelectField";
import ToolbarOptionGroup, { type ToolbarOption } from "./ToolbarOptionGroup";

export type ToolbarSection = "view" | "filter" | "action" | "edit" | "meta";

export interface ToolbarItemBase {
  section?: ToolbarSection;
}

export interface ToolbarButtonItem extends ToolbarItemBase {
  kind: "button";
  key: string;
  label: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}

export interface ToolbarIconButtonItem extends ToolbarItemBase {
  kind: "icon-button";
  key: string;
  icon: ActionGlyphKind;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export interface ToolbarSearchItem extends ToolbarItemBase {
  kind: "search";
  key: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  scope?: "full" | readonly string[];
  className?: string;
}

export interface ToolbarSelectItem extends ToolbarItemBase {
  kind: "select";
  key: string;
  value: string;
  options: SelectFieldOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  triggerClassName?: string;
}

export interface ToolbarOptionGroupItem extends ToolbarItemBase {
  kind: "option-group";
  key: string;
  value: string;
  options: ToolbarOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export interface ToolbarColumnToggleItem extends ToolbarItemBase {
  kind: "column-toggle";
  key: string;
  columns: ColumnDef[];
  visible: string[];
  onChange: (visible: string[]) => void;
}

export interface ToolbarTextItem extends ToolbarItemBase {
  kind: "text";
  key: string;
  content: ReactNode;
}

export interface ToolbarCustomItem extends ToolbarItemBase {
  kind: "custom";
  key: string;
  content: ReactNode;
}

export type ToolbarItem =
  | ToolbarButtonItem
  | ToolbarIconButtonItem
  | ToolbarSearchItem
  | ToolbarSelectItem
  | ToolbarOptionGroupItem
  | ToolbarColumnToggleItem
  | ToolbarTextItem
  | ToolbarCustomItem;

export interface ToolbarProps {
  items: ToolbarItem[];
  className?: string;
  onSubmit?: () => void;
  variant?: "bar" | "inline";
}

const SECTION_ORDER: ToolbarSection[] = ["view", "filter", "action", "edit", "meta"];

function ToolbarDivider() {
  return <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-slate-200 sm:inline-block" />;
}

function ToolbarItemRenderer({ item }: { item: ToolbarItem }) {
  switch (item.kind) {
    case "button":
      return (
        <ActionButton
          type={item.type}
          variant={item.variant ?? "secondary"}
          disabled={item.disabled}
          onClick={item.onClick}
        >
          {item.label}
        </ActionButton>
      );
    case "icon-button":
      return (
        <IconActionButton
          kind={item.icon}
          label={item.label}
          type={item.type}
          variant={item.variant}
          disabled={item.disabled}
          onClick={item.onClick}
          className={item.className}
        />
      );
    case "search": {
      const ariaLabel =
        item.ariaLabel ??
        (item.scope === "full" || !item.scope
          ? "搜索全部字段"
          : `搜索${item.scope.join("、")}`);
      return (
        <SearchInput
          value={item.value}
          onChange={item.onChange}
          placeholder={item.placeholder}
          ariaLabel={ariaLabel}
          className={item.className ?? "min-w-0"}
        />
      );
    }
    case "select":
      return (
        <SelectField
          value={item.value}
          options={item.options}
          onChange={item.onChange}
          placeholder={item.placeholder}
          triggerClassName={item.triggerClassName}
        />
      );
    case "option-group":
      return (
        <ToolbarOptionGroup
          value={item.value}
          options={item.options}
          onChange={item.onChange}
          ariaLabel={item.ariaLabel}
        />
      );
    case "column-toggle":
      return (
        <ColumnToggle
          columns={item.columns}
          visible={item.visible}
          onChange={item.onChange}
        />
      );
    case "text":
      return (
        <span className="flex items-center text-xs font-semibold text-slate-500">
          {item.content}
        </span>
      );
    case "custom":
      return <>{item.content}</>;
    default:
      return null;
  }
}

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
    const section = inferSection(item);
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

  const renderSection = (section: { key: ToolbarSection; items: ToolbarItem[] }, sectionIndex: number) => (
    <div key={section.key} className="flex min-h-10 min-w-0 flex-wrap items-center gap-2">
      {sectionIndex > 0 && <ToolbarDivider />}
      {section.items.map((item) => (
        <ToolbarItemRenderer key={item.key} item={item} />
      ))}
    </div>
  );

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

function inferSection(item: ToolbarItem): ToolbarSection {
  if (item.section) return item.section;
  switch (item.kind) {
    case "search":
    case "select":
    case "option-group":
      return "filter";
    case "text":
    case "column-toggle":
      return "meta";
    case "button":
    case "icon-button":
    case "custom":
    default:
      return "action";
  }
}

export default Toolbar;
