export type SelectorTreeNodeKey = string | number;

export function createSelectorTreeExpandedIds<T, K extends SelectorTreeNodeKey>({
  items,
  getKey,
  collapsedIds,
}: {
  items: T[];
  getKey: (item: T) => K;
  collapsedIds: ReadonlySet<K>;
}) {
  return new Set(items.filter((item) => !collapsedIds.has(getKey(item))).map(getKey));
}

export function createSelectorTreeCollapsedIds<T, K extends SelectorTreeNodeKey>({
  items,
  getKey,
  collapsed,
}: {
  items: T[];
  getKey: (item: T) => K;
  collapsed: boolean;
}) {
  return collapsed ? new Set(items.map(getKey)) : new Set<K>();
}

export function setSelectorTreeNodeExpanded<K extends SelectorTreeNodeKey>(
  collapsedIds: ReadonlySet<K>,
  id: K,
  expanded: boolean,
) {
  const next = new Set(collapsedIds);
  if (expanded) next.delete(id);
  else next.add(id);
  return next;
}
