"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { ActionGlyphKind } from "./internal/action/ActionGlyphs";
import Badge from "./internal/common/Badge";
import { EmptyStateCard, PanelCard } from "./internal/common/Card";
import SearchInput from "./internal/input/SearchInput";
import SelectorPanel from "./internal/selection/SelectorPanel";
import { renderCommands } from "./internal/page/PageSurface.commands";

export type SelectorSurfaceLooseItem = ReturnType<typeof JSON.parse>;
export type SelectorSurfaceActionSize = "sm" | "md" | "lg";

export interface SelectorSurfaceCommandSpec {
  key: string;
  label: ReactNode;
  icon?: ActionGlyphKind | "back" | "create" | "open";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: SelectorSurfaceActionSize;
  truncate?: boolean;
}

export interface SelectorSurfaceFilterSpec {
  kind: "search";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface SelectorSurfaceCardSpec {
  title: ReactNode;
  subtitle?: ReactNode;
  code?: ReactNode;
  level?: number;
  meta?: ReactNode[] | ReactNode;
  metaLine?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  status?: SelectorSurfaceStatusSpec;
  archived?: boolean;
  active?: boolean;
  tone?: "blue" | "emerald" | "amber" | "slate";
  showToggle?: boolean;
  size?: "sm" | "md";
}

export interface SelectorSurfaceStatusSpec {
  label: ReactNode;
  tone?: "success" | "warning" | "muted" | "default";
  disabled?: boolean;
  onClick?: () => void;
}

export interface SelectorSurfaceBaseSpec<T> {
  title?: ReactNode;
  commands?: SelectorSurfaceCommandSpec[];
  items: T[];
  selectedId: string | number | null;
  onSelect: (item: T) => void;
  getKey: (item: T) => string | number;
  renderItem: (item: T, ctx: {
    active: boolean;
    level: number;
    expanded?: boolean;
    hasChildren?: boolean;
  }) => SelectorSurfaceCardSpec;
  filter?: SelectorSurfaceFilterSpec;
  loading?: boolean;
  loadingText?: ReactNode;
  emptyText?: ReactNode;
}

export interface SelectorSurfaceListSpec<T = SelectorSurfaceLooseItem> extends SelectorSurfaceBaseSpec<T> {
  kind: "list";
  groupBy?: (item: T) => string | null | undefined;
  size?: "sm" | "md";
}

export interface SelectorSurfaceTreeSpec<T = SelectorSurfaceLooseItem> extends SelectorSurfaceBaseSpec<T> {
  kind: "tree";
  getChildren: (item: T) => T[] | undefined;
  expandedIds?: Iterable<string | number>;
  defaultExpandedIds?: Iterable<string | number>;
  defaultExpandedLevel?: number;
  onToggle?: (id: string | number, expanded: boolean) => void;
  collapsible?: boolean;
}

export type SelectorSurfaceProps<T = SelectorSurfaceLooseItem> =
  | SelectorSurfaceListSpec<T>
  | SelectorSurfaceTreeSpec<T>;

function collectExpandedIds<T>(
  items: T[],
  getKey: (item: T) => string | number,
  getChildren: (item: T) => T[] | undefined,
  defaultExpandedLevel: number,
) {
  const expanded = new Set<string | number>();
  function visit(nodes: T[], level: number) {
    for (const node of nodes) {
      const children = getChildren(node);
      if (children?.length && level <= defaultExpandedLevel) {
        expanded.add(getKey(node));
        visit(children, level + 1);
      }
    }
  }
  visit(items, 1);
  return expanded;
}

function listCard(card: SelectorSurfaceCardSpec) {
  return {
    title: card.title,
    subtitle: card.subtitle,
    code: card.code,
    meta: Array.isArray(card.meta) ? card.meta : card.meta ? [card.meta] : undefined,
    metaLine: card.metaLine,
    leading: card.leading,
    trailing: card.trailing ?? renderStatus(card.status),
    active: card.active,
    archived: card.archived,
    size: card.size,
  };
}

function statusClassName(tone: SelectorSurfaceStatusSpec["tone"] = "default") {
  if (tone === "success") return "bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "bg-amber-50 text-amber-700";
  if (tone === "muted") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-700";
}

function renderStatus(status?: SelectorSurfaceStatusSpec) {
  if (!status) return null;
  const className = `rounded px-1.5 py-0.5 text-xs font-medium ${statusClassName(status.tone)} ${status.onClick && !status.disabled ? "hover:ring-1 hover:ring-current/20" : ""} ${status.disabled ? "cursor-not-allowed opacity-50" : ""}`;
  if (!status.onClick) return <span className={className}>{status.label}</span>;
  return (
    <button
      type="button"
      className={className}
      disabled={status.disabled}
      onClick={(event) => {
        event.stopPropagation();
        status.onClick?.();
      }}
    >
      {status.label}
    </button>
  );
}

function treeMeta(card: SelectorSurfaceCardSpec) {
  if (card.metaLine) return card.metaLine;
  if (Array.isArray(card.meta)) return card.meta.filter(Boolean);
  return card.meta;
}

function renderTreeMeta(meta: ReactNode[] | ReactNode) {
  if (Array.isArray(meta)) {
    return (
      <span className="mt-1 flex min-w-0 flex-wrap gap-1.5">
        {meta.map((item, index) => (
          <span key={index} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
            {item}
          </span>
        ))}
      </span>
    );
  }
  return <span className="mt-1 block truncate text-xs text-slate-500">{meta}</span>;
}

function TreeSelector<T>({ selector, actions }: {
  selector: SelectorSurfaceTreeSpec<T>;
  actions: ReactNode;
}) {
  const defaultExpandedIds = useMemo(() => {
    if (selector.defaultExpandedIds) return new Set(selector.defaultExpandedIds);
    if (typeof selector.defaultExpandedLevel === "number") {
      return collectExpandedIds(selector.items, selector.getKey, selector.getChildren, selector.defaultExpandedLevel);
    }
    return new Set<string | number>();
  }, [selector]);
  const [internalExpandedIds, setInternalExpandedIds] = useState(defaultExpandedIds);
  const expandedIds = selector.expandedIds ? new Set(selector.expandedIds) : internalExpandedIds;
  const collapsible = selector.collapsible !== false;

  function toggle(id: string | number) {
    const nextExpanded = !expandedIds.has(id);
    if (selector.onToggle) {
      selector.onToggle(id, nextExpanded);
      return;
    }
    setInternalExpandedIds((current) => {
      const next = new Set(current);
      if (nextExpanded) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function renderRows(items: T[], level: number): ReactNode {
    return items.map((item) => {
      const id = selector.getKey(item);
      const children = selector.getChildren(item);
      const hasChildren = Boolean(children?.length);
      const expanded = !collapsible && hasChildren ? true : expandedIds.has(id);
      const active = selector.selectedId === id;
      const card = selector.renderItem(item, { active, level, expanded, hasChildren });
      const meta = treeMeta(card);
      const cardClassName = active
        ? "border-slate-200 bg-emerald-50"
        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50";
      const row = (
        <div key="row" className="space-y-1">
          <div
            className={`grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-stretch overflow-hidden rounded-md border transition focus-within:ring-2 focus-within:ring-emerald-200 ${cardClassName}`}
          >
            <span className="grid place-items-center">
              {hasChildren && collapsible ? (
                <button
                  type="button"
                  className="grid size-7 place-items-center rounded text-sm font-semibold text-slate-500 transition hover:bg-white hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                  aria-label={expanded ? "收起" : "展开"}
                  onClick={() => toggle(id)}
                >
                  <span className="font-mono leading-none">{expanded ? "-" : "+"}</span>
                </button>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => selector.onSelect(item)}
              className="min-w-0 px-2.5 py-2 text-left focus-visible:outline-none"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Badge level={card.level ?? level} className="shrink-0 px-2 py-0.5 font-semibold" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{card.title}</span>
                {card.code ? <span className="shrink-0 font-mono text-xs text-slate-400">{card.code}</span> : null}
                {card.trailing ? <span className="shrink-0 text-xs text-slate-500">{card.trailing}</span> : null}
                {card.status ? <span className="shrink-0">{renderStatus(card.status)}</span> : null}
              </span>
              {meta ? renderTreeMeta(meta) : null}
            </button>
          </div>
        </div>
      );
      if (!hasChildren) return <div key={id}>{row}</div>;
      return (
        <div key={id} className="space-y-1.5 py-1">
          {row}
          {expanded ? (
            <div className="ml-4 space-y-1.5 border-l border-slate-200 pl-4">
              {renderRows(children!, level + 1)}
            </div>
          ) : null}
        </div>
      );
    });
  }

  const content = (
    <>
      {selector.filter?.kind === "search" ? (
        <div className="mb-3">
          <SearchInput
            value={selector.filter.value}
            onChange={selector.filter.onChange}
            placeholder={selector.filter.placeholder}
          />
        </div>
      ) : null}
      {selector.loading ? (
        <EmptyStateCard compact>{selector.loadingText ?? "加载中..."}</EmptyStateCard>
      ) : selector.items.length === 0 ? (
        <EmptyStateCard compact>{selector.emptyText ?? "暂无数据"}</EmptyStateCard>
      ) : (
        <div className="space-y-1.5">{renderRows(selector.items, 1)}</div>
      )}
    </>
  );

  return (
    <PanelCard
      title={selector.title}
      actions={actions}
      bodyClassName="max-h-[760px] overflow-auto p-3"
    >
      {content}
    </PanelCard>
  );
}

export default function SelectorSurface<T>(selector: SelectorSurfaceProps<T>) {
  const actions = renderCommands(selector.commands);
  if (selector.kind === "tree") {
    return <TreeSelector selector={selector} actions={actions} />;
  }

  return (
    <SelectorPanel
      mode="list"
      framed
      title={selector.title}
      actions={actions}
      items={selector.items}
      selectedId={selector.selectedId}
      onSelect={selector.onSelect}
      getKey={selector.getKey}
      groupBy={selector.groupBy}
      size={selector.size}
      filter={selector.filter}
      loading={selector.loading}
      loadingText={selector.loadingText}
      emptyText={selector.emptyText}
      bodyClassName="max-h-[760px] overflow-auto p-3"
      contentClassName="space-y-2"
      renderItem={(item, ctx) => listCard(selector.renderItem(item, {
        active: ctx.active,
        level: 1,
      }))}
    />
  );
}
