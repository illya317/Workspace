"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { TreeNodeBranch, TreeNodeCard, type TreeNodeCardProps } from "./HierarchyTree";

export interface SelectorTreeItemContext {
  level: number;
  expanded: boolean;
  hasChildren: boolean;
}

export interface SelectorTreeProps<T> {
  items: T[];
  selectedId: string | number | null;
  onSelect: (item: T) => void;
  getKey: (item: T) => string | number;
  getChildren: (item: T) => T[] | undefined;
  renderItem: (item: T, ctx: SelectorTreeItemContext) => Omit<TreeNodeCardProps, "active" | "onClick" | "toggle" | "children">;
  expandedIds?: Iterable<string | number>;
  defaultExpandedIds?: Iterable<string | number>;
  onToggle?: (id: string | number, expanded: boolean) => void;
  collapsible?: boolean;
  emptyText?: ReactNode;
  className?: string;
}

export function SelectorTree<T>({
  items,
  selectedId,
  onSelect,
  getKey,
  getChildren,
  renderItem,
  expandedIds,
  defaultExpandedIds,
  onToggle,
  collapsible = true,
  emptyText = "暂无数据",
  className = "",
}: SelectorTreeProps<T>) {
  const [internalExpanded, setInternalExpanded] = useState<Set<string | number>>(() => {
    if (defaultExpandedIds) return new Set(defaultExpandedIds);
    return new Set<string | number>();
  });

  const controlled = expandedIds !== undefined;
  const expandedSet = controlled ? new Set(expandedIds) : internalExpanded;

  function toggle(id: string | number) {
    const nextExpanded = !expandedSet.has(id);
    if (onToggle) {
      onToggle(id, nextExpanded);
      return;
    }
    setInternalExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (items.length === 0) {
    return <div className="py-6 text-center text-sm text-slate-400">{emptyText}</div>;
  }

  function Node({ item, level }: { item: T; level: number }) {
    const id = getKey(item);
    const children = getChildren(item);
    const hasChildren = Boolean(children && children.length > 0);
    const expanded = !collapsible && hasChildren ? true : expandedSet.has(id);
    const active = selectedId === id;
    const cardProps = renderItem(item, { level, expanded, hasChildren });

    return (
      <TreeNodeCard
        {...cardProps}
        active={active}
        onClick={() => onSelect(item)}
        toggle={
          hasChildren && collapsible
            ? {
                enabled: true,
                expanded,
                label: expanded ? "收起" : "展开",
                onClick: () => toggle(id),
              }
            : undefined
        }
      >
        {expanded && hasChildren && (
          <TreeNodeBranch className="mt-2">
            {children!.map((child) => (
              <Node key={getKey(child)} item={child} level={level + 1} />
            ))}
          </TreeNodeBranch>
        )}
      </TreeNodeCard>
    );
  }

  return (
    <div className={className}>
      {items.map((item) => (
        <Node key={getKey(item)} item={item} level={1} />
      ))}
    </div>
  );
}

export default SelectorTree;
