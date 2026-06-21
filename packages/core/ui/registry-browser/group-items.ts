import type { RegistryBrowserGroup, RegistryBrowserItem } from "./types";

export function groupItems(items: RegistryBrowserItem[]): RegistryBrowserGroup[] {
  const groups = new Map<string, RegistryBrowserItem[]>();
  for (const item of items) {
    groups.set(item.kind, [...(groups.get(item.kind) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([kind, groupItems]) => ({
      kind,
      label: groupItems[0]?.kindLabel ?? kind,
      description: groupItems[0]?.kindDescription ?? "",
      items: groupItems.sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}
