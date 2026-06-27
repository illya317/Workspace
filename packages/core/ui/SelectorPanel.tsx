"use client";

import type { ReactNode } from "react";
import { EmptyStateCard, PanelCard } from "./Card";
import SearchInput from "./SearchInput";
import SelectorList, { type SelectorListItemContext } from "./SelectorList";
import SelectorTree, { type SelectorTreeItemContext } from "./SelectorTree";
import SelectionGrid, { type SelectionGridProps } from "./SelectionGrid";
import type { SelectorCardProps, SelectorCardSize } from "./SelectorCard";
import type { TreeNodeCardProps } from "./HierarchyTree";

export type SelectorPanelMode = "list" | "tree" | "grid";

export interface SelectorPanelBaseProps<T> {
  mode?: SelectorPanelMode;
  items: T[];
  selectedId: string | number | null;
  onSelect: (item: T) => void;
  getKey: (item: T) => string | number;
  size?: SelectorCardSize;
  groupBy?: (item: T) => string | null | undefined;
  filter?: {
    kind: "search";
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  loading?: boolean;
  loadingText?: ReactNode;
  emptyText?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  framed?: boolean;
  className?: string;
  bodyClassName?: string;
  contentClassName?: string;
}

export interface SelectorPanelListProps<T> extends SelectorPanelBaseProps<T> {
  mode?: "list";
  renderItem: (item: T, ctx: SelectorListItemContext) => Omit<SelectorCardProps, "onClick">;
}

export interface SelectorPanelTreeProps<T> extends SelectorPanelBaseProps<T> {
  mode: "tree";
  getChildren: (item: T) => T[] | undefined;
  expandedIds?: Iterable<string | number>;
  defaultExpandedIds?: Iterable<string | number>;
  onToggle?: (id: string | number, expanded: boolean) => void;
  collapsible?: boolean;
  renderItem: (item: T, ctx: SelectorTreeItemContext) => Omit<TreeNodeCardProps, "active" | "onClick" | "toggle" | "children">;
}

export interface SelectorPanelGridProps<T> extends SelectorPanelBaseProps<T>, Pick<SelectionGridProps, "columns" | "layout" | "minItemWidth" | "truncate" | "disabled"> {
  mode: "grid";
  ariaLabel: string;
  getLabel: (item: T, index: number) => string;
  getCode?: (item: T, index: number) => string | undefined;
}

export type SelectorPanelProps<T> = SelectorPanelListProps<T> | SelectorPanelTreeProps<T> | SelectorPanelGridProps<T>;

function isTreeProps<T>(props: SelectorPanelProps<T>): props is SelectorPanelTreeProps<T> {
  return props.mode === "tree" || "getChildren" in props;
}

function isGridProps<T>(props: SelectorPanelProps<T>): props is SelectorPanelGridProps<T> {
  return props.mode === "grid";
}

export function SelectorPanel<T>(props: SelectorPanelProps<T>): ReactNode {
  const {
    items,
    selectedId,
    onSelect,
    getKey,
    size,
    groupBy,
    filter,
    loading = false,
    loadingText = "加载中...",
    emptyText = "暂无数据",
    title,
    subtitle,
    actions,
    framed = true,
    className = "",
    bodyClassName = "",
    contentClassName = "",
  } = props;

  const hasSearch = filter?.kind === "search";

  function renderContent() {
    if (loading) {
      return (
        <EmptyStateCard compact>{loadingText}</EmptyStateCard>
      );
    }

    if (items.length === 0) {
      return <EmptyStateCard compact>{emptyText}</EmptyStateCard>;
    }

    if (isTreeProps(props)) {
      return (
        <SelectorTree
          items={items}
          selectedId={selectedId}
          onSelect={onSelect}
          getKey={getKey}
          getChildren={props.getChildren}
          renderItem={props.renderItem}
          expandedIds={props.expandedIds}
          defaultExpandedIds={props.defaultExpandedIds}
          onToggle={props.onToggle}
          collapsible={props.collapsible}
          emptyText={emptyText}
          className={contentClassName}
        />
      );
    }

    if (isGridProps(props)) {
      const options = items.map((item, index) => ({
        value: String(getKey(item)),
        label: props.getLabel(item, index),
        code: props.getCode?.(item, index),
      }));
      return (
        <SelectionGrid
          options={options}
          value={selectedId === null ? null : String(selectedId)}
          onChange={(next) => {
            const selected = items.find((item) => String(getKey(item)) === next);
            if (selected) onSelect(selected);
          }}
          columns={props.columns}
          layout={props.layout}
          minItemWidth={props.minItemWidth}
          truncate={props.truncate}
          disabled={props.disabled}
          emptyText={emptyText}
          ariaLabel={props.ariaLabel}
          className={contentClassName}
        />
      );
    }

    return (
      <SelectorList
        items={items}
        selectedId={selectedId}
        onSelect={onSelect}
        getKey={getKey}
        renderItem={props.renderItem}
        size={size}
        groupBy={groupBy}
        emptyText={emptyText}
        className={contentClassName}
      />
    );
  }

  const content = (
    <>
      {hasSearch && (
        <div className="mb-3">
          <SearchInput
            value={filter.value}
            onChange={filter.onChange}
            placeholder={filter.placeholder}
          />
        </div>
      )}
      {renderContent()}
    </>
  );

  if (!framed) {
    return (
      <div className={className}>
        {content}
      </div>
    );
  }

  return (
    <PanelCard
      className={className}
      bodyClassName={bodyClassName}
      title={title}
      subtitle={subtitle}
      actions={actions}
    >
      {content}
    </PanelCard>
  );
}

export default SelectorPanel;
