"use client";

import type { ReactNode } from "react";
import { EmptyStateCard } from "../common/Card";
import { joinClassNames } from "../common/card-utils";
import SelectorCard, { type SelectorCardProps, type SelectorCardSize } from "./SelectorCard";

export interface SelectorListItemContext {
  active: boolean;
}

export interface SelectorListProps<T> {
  items: T[];
  selectedId?: string | number | null;
  onSelect: (item: T) => void;
  getKey: (item: T) => string | number;
  renderItem: (item: T, ctx: SelectorListItemContext) => Omit<SelectorCardProps, "onClick">;
  size?: SelectorCardSize;
  groupBy?: (item: T) => string | null | undefined;
  emptyText?: ReactNode;
  className?: string;
  itemClassName?: string;
}

export function SelectorList<T>({
  items,
  selectedId,
  onSelect,
  getKey,
  renderItem,
  size,
  groupBy,
  emptyText = "暂无数据",
  className = "",
  itemClassName = "",
}: SelectorListProps<T>) {
  if (items.length === 0) {
    return <EmptyStateCard compact>{emptyText}</EmptyStateCard>;
  }

  if (groupBy) {
    const groups = new Map<string, T[]>();
    const order: string[] = [];
    for (const item of items) {
      const group = groupBy(item) ?? "";
      if (!groups.has(group)) {
        groups.set(group, []);
        order.push(group);
      }
      groups.get(group)!.push(item);
    }

    const nonEmptyGroups = order.filter((group) => groups.get(group)!.length > 0);
    if (nonEmptyGroups.length === 0) {
      return <EmptyStateCard compact>{emptyText}</EmptyStateCard>;
    }

    return (
      <div className={className}>
        {nonEmptyGroups.map((group) => (
          <div key={group} className="space-y-2">
            {group && (
              <div className="px-1 text-xs font-semibold text-slate-500">{group}</div>
            )}
            <ItemList
              items={groups.get(group)!}
              selectedId={selectedId}
              onSelect={onSelect}
              getKey={getKey}
              renderItem={renderItem}
              size={size}
              itemClassName={itemClassName}
              className="space-y-2"
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <ItemList
      items={items}
      selectedId={selectedId}
      onSelect={onSelect}
      getKey={getKey}
      renderItem={renderItem}
      size={size}
      itemClassName={itemClassName}
      className={className}
    />
  );
}

interface ItemListProps<T> {
  items: T[];
  selectedId?: string | number | null;
  onSelect: (item: T) => void;
  getKey: (item: T) => string | number;
  renderItem: (item: T, ctx: SelectorListItemContext) => Omit<SelectorCardProps, "onClick">;
  size?: SelectorCardSize;
  itemClassName?: string;
  className?: string;
}

function ItemList<T>({
  items,
  selectedId,
  onSelect,
  getKey,
  renderItem,
  size,
  itemClassName,
  className,
}: ItemListProps<T>) {
  return (
    <div className={className}>
      {items.map((item) => {
        const key = getKey(item);
        const cardProps = renderItem(item, { active: selectedId === key });
        const active = cardProps.active ?? selectedId === key;
        return (
          <SelectorCard
            key={key}
            {...cardProps}
            active={active}
            onClick={() => onSelect(item)}
            size={size ?? cardProps.size}
            className={joinClassNames(itemClassName, cardProps.className)}
          />
        );
      })}
    </div>
  );
}

export default SelectorList;
