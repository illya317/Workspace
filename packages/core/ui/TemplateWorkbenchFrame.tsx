"use client";

import { useMemo, useState, type ReactNode } from "react";
import { EmptyStateCard, PanelCard } from "./BaseCards";
import { joinClassNames } from "./card-utils";
import { Toolbar, type ToolbarItem } from "./Toolbar";
import SelectorCard, { type SelectorCardMetaItem } from "./SelectorCard";
import Badge, { type BadgeProps } from "./Badge";
import { matchText } from "../search";
import { getToolbarActionClassName } from "./toolbar-styles";

export interface TemplateWorkbenchSelectorItem {
  key: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: Array<ReactNode | SelectorCardMetaItem>;
  trailing?: ReactNode;
}

export interface TemplateWorkbenchRowAction {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger";
  indicator?: "danger" | "success";
}

export interface TemplateWorkbenchRow {
  key: string;
  badge: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  inset?: boolean;
  searchText?: Array<string | number | null | undefined>;
  actions?: TemplateWorkbenchRowAction[];
}

export interface TemplateWorkbenchSection {
  key: string;
  selectorKey?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  searchText?: Array<string | number | null | undefined>;
  status?: { label: string; tone: BadgeProps["tone"] };
  collapsible?: boolean;
  defaultExpanded?: boolean;
  expanded?: boolean;
  toggleLabel?: ReactNode;
  toggleUnit?: string;
  toggleCount?: number;
  onToggle?: () => void;
  rows: TemplateWorkbenchRow[];
}

export interface TemplateWorkbenchFrameProps {
  selectorTitle: ReactNode;
  selectorItems: TemplateWorkbenchSelectorItem[];
  sections: TemplateWorkbenchSection[];
  activeSelectorKey?: string;
  defaultSelectorKey?: string;
  onSelectorChange?: (key: string) => void;
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (value: string) => void;
  searchPlaceholder?: string;
  toolbarMeta?: ReactNode;
  hideToolbar?: boolean;
  emptyText?: ReactNode;
  className?: string;
}

export type TemplateWorkbenchViewModel = Pick<TemplateWorkbenchFrameProps, "selectorTitle" | "selectorItems" | "sections" | "defaultSelectorKey" | "searchPlaceholder" | "toolbarMeta" | "emptyText" | "hideToolbar">;

interface SectionView extends TemplateWorkbenchSection {
  expandedView: boolean;
  rows: Array<TemplateWorkbenchRow & { renderedActions: TemplateWorkbenchRowAction[] }>;
}

const indicatorClassNames = { danger: "bg-red-600", success: "bg-emerald-700" } as const;

function textMatches(values: Array<ReactNode | string | number | null | undefined>, keyword: string) {
  return values.some((value) => matchText(String(value ?? ""), keyword));
}

function RowAction({ action }: { action: TemplateWorkbenchRowAction }) {
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
      className={joinClassNames(getToolbarActionClassName(action.variant), "h-9 px-3 text-xs")}
    >
      {action.indicator && <span className={joinClassNames("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle", indicatorClassNames[action.indicator])} />}
      {action.loading ? "加载中" : action.label}
    </button>
  );
}

function TemplateRow({ row }: { row: SectionView["rows"][number] }) {
  return (
    <div className={joinClassNames("grid gap-4 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center", row.inset && "pl-9")}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="min-w-9 rounded-full bg-blue-50 px-3 py-1 text-center text-xs font-semibold text-blue-700">{row.badge}</span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-900">{row.title}</div>
          {row.description && <div className="mt-1 truncate text-xs text-slate-500">{row.description}</div>}
        </div>
      </div>
      {row.renderedActions.length > 0 && <div className="flex shrink-0 gap-2 md:justify-self-end">{row.renderedActions.map((action, index) => <RowAction key={index} action={action} />)}</div>}
    </div>
  );
}

function toggleText(section: SectionView) {
  if (section.toggleLabel) return section.toggleLabel;
  if (typeof section.toggleCount === "number" && section.toggleUnit) {
    return `${section.expandedView ? "收起" : "展开"} · ${section.toggleCount} ${section.toggleUnit}`;
  }
  return section.expandedView ? "收起" : "展开";
}

function TemplateSection({ section, onToggle }: { section: SectionView; onToggle: () => void }) {
  const title = (
    <span className="flex min-w-0 items-center gap-3">
      <span className="truncate">{section.title}</span>
      {section.status && <Badge label={section.status.label} tone={section.status.tone} />}
    </span>
  );
  const canToggle = section.collapsible || section.onToggle;

  return (
    <PanelCard
      title={title}
      subtitle={section.subtitle}
      actions={canToggle && (
        <button type="button" onClick={section.onToggle ?? onToggle} className={joinClassNames(getToolbarActionClassName("secondary", "sm"), "px-3 py-1.5 text-sm")}>
          {toggleText(section)}
        </button>
      )}
    >
      {section.expandedView && <div className="divide-y divide-slate-100">{section.rows.map((row) => <TemplateRow key={row.key} row={row} />)}</div>}
    </PanelCard>
  );
}

export default function TemplateWorkbenchFrame({
  selectorTitle,
  selectorItems,
  sections,
  activeSelectorKey,
  defaultSelectorKey,
  onSelectorChange,
  query,
  defaultQuery = "",
  onQueryChange,
  searchPlaceholder = "搜索模板、阶段、项目",
  toolbarMeta,
  hideToolbar = false,
  emptyText = "没有匹配的模板。",
  className = "",
}: TemplateWorkbenchFrameProps) {
  const [innerSelectorKey, setInnerSelectorKey] = useState(defaultSelectorKey ?? selectorItems[0]?.key ?? "");
  const [innerQuery, setInnerQuery] = useState(defaultQuery);
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});
  const selectedKey = activeSelectorKey ?? innerSelectorKey;
  const searchValue = query ?? innerQuery;
  const keyword = searchValue.trim();

  const updateSelector = (key: string) => {
    setInnerSelectorKey(key);
    onSelectorChange?.(key);
  };
  const updateQuery = (value: string) => {
    setInnerQuery(value);
    onQueryChange?.(value);
  };
  const toggleSection = (section: TemplateWorkbenchSection, expandedView: boolean) => {
    section.onToggle?.();
    if (!section.onToggle && typeof section.expanded !== "boolean") {
      setExpandedOverrides((current) => ({ ...current, [section.key]: !expandedView }));
    }
  };

  const viewSections = useMemo<SectionView[]>(() => sections
    .filter((section) => selectedKey === "all" || !section.selectorKey || section.selectorKey === selectedKey)
    .map((section) => {
      const expandedView = section.expanded ?? expandedOverrides[section.key] ?? section.defaultExpanded ?? true;
      const rows = section.rows.filter((row) => !keyword || textMatches(row.searchText ?? [row.title, row.description, row.badge], keyword));
      return {
        ...section,
        expandedView,
        rows: rows.map((row) => ({
          ...row,
          renderedActions: row.actions ?? [],
        })),
      };
    })
    .filter((section) => section.rows.length > 0 || !keyword || textMatches(section.searchText ?? [section.title, section.subtitle], keyword)), [expandedOverrides, keyword, sections, selectedKey]);

  const toolbarItems: ToolbarItem[] = [];
  toolbarItems.push({
    kind: "search",
    key: "search",
    section: "filter",
    value: searchValue,
    onChange: updateQuery,
    placeholder: searchPlaceholder,
    className: "min-w-[260px] flex-1",
  });
  if (toolbarMeta) {
    toolbarItems.push({ kind: "text", key: "meta", section: "meta", content: toolbarMeta });
  }

  return (
    <section className={joinClassNames("space-y-5", className)}>
      {!hideToolbar && <Toolbar items={toolbarItems} />}
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <PanelCard title={selectorTitle} bodyClassName="p-3">
          <div className="space-y-2">
            {selectorItems.map((item) => <SelectorCard key={item.key} title={item.title} subtitle={item.subtitle} meta={item.meta} trailing={item.trailing} active={selectedKey === item.key} onClick={() => updateSelector(item.key)} />)}
          </div>
        </PanelCard>
        <div className="min-w-0 space-y-5">
          {viewSections.map((section) => <TemplateSection key={section.key} section={section} onToggle={() => toggleSection(section, section.expandedView)} />)}
          {viewSections.length === 0 && <EmptyStateCard>{emptyText}</EmptyStateCard>}
        </div>
      </div>
    </section>
  );
}
