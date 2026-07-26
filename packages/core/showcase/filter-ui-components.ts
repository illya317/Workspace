import type { CoreUiDeclarationCategory } from "../ui/registry/component-registry";
import type { CoreUiComponentTreeNode } from "../ui/registry/component-registry-view";

export type UiComponentCategoryFilter = CoreUiDeclarationCategory | "all";

export function filterUiComponents(
  nodes: readonly CoreUiComponentTreeNode[],
  {
    keyword,
    categoryValue,
  }: {
    keyword: string;
    categoryValue: UiComponentCategoryFilter;
  },
) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return nodes.filter((node) => {
    if (categoryValue !== "all" && node.category !== categoryValue) return false;
    if (!normalizedKeyword) return true;

    const declares = node.component.declares ?? [];
    const haystack = [
      node.name,
      node.component.description,
      ...declares.flatMap((item) => [item.name, item.description]),
    ].join(" ").toLowerCase();

    return haystack.includes(normalizedKeyword);
  });
}
