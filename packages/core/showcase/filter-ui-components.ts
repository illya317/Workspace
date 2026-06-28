import {
  coreUiComponentCategoryMeta,
  coreUiComponentSubcategoryMeta,
  type CoreUiExposure,
  type CoreUiComponentCategory,
  type CoreUiComponentSubcategory,
} from "@workspace/core/ui/component-registry";
import { matchText } from "@workspace/core/search";

export type UiComponentFilterNode = {
  name: string;
  component: {
    description: string;
    exposure?: CoreUiExposure;
    category?: CoreUiComponentCategory;
    subcategory?: CoreUiComponentSubcategory;
  };
  verified: boolean;
};

export type UiComponentFilterInput = {
  keyword: string;
  categoryValue: string;
  exposureFilter: "direct" | "via" | "internal" | "all";
  verifiedFilter: "verified" | "unverified" | "all";
  usageFilesByName: ReadonlyMap<string, readonly string[]>;
  usedByNamesByName: ReadonlyMap<string, readonly string[]>;
};

function matchesBaseFilters(
  node: UiComponentFilterNode,
  input: Pick<UiComponentFilterInput, "categoryValue" | "exposureFilter" | "verifiedFilter">,
) {
  const { categoryValue, exposureFilter, verifiedFilter } = input;
  if (categoryValue !== "all" && node.component.category !== categoryValue) return false;
  if (exposureFilter !== "all" && node.component.exposure?.mode !== exposureFilter) return false;
  if (verifiedFilter === "verified" && !node.verified) return false;
  if (verifiedFilter === "unverified" && node.verified) return false;
  return true;
}

function matchesKeyword(
  node: UiComponentFilterNode,
  keyword: string,
  usageFiles: readonly string[],
) {
  return matchText(node.name, keyword)
    || matchText(node.component.description, keyword)
    || Boolean(node.component.category && (
      matchText(node.component.category, keyword)
      || matchText(coreUiComponentCategoryMeta[node.component.category].label, keyword)
    ))
    || Boolean(node.component.subcategory && (
      matchText(node.component.subcategory, keyword)
      || matchText(coreUiComponentSubcategoryMeta[node.component.subcategory].label, keyword)
    ))
    || usageFiles.some((file) => matchText(file, keyword));
}

export function filterUiComponents<T extends UiComponentFilterNode>(
  nodes: readonly T[],
  input: UiComponentFilterInput,
): T[] {
  const {
    keyword,
    usageFilesByName,
    usedByNamesByName,
  } = input;

  if (!keyword) {
    return nodes.filter((node) => matchesBaseFilters(node, input));
  }

  const directMatches = nodes.filter((node) => {
    const usageFiles = usageFilesByName.get(node.name) ?? [];
    return matchesKeyword(node, keyword, usageFiles);
  });
  const directMatchNames = new Set(directMatches.map((node) => node.name));

  return nodes.filter((node) => {
    if (!matchesBaseFilters(node, input)) return false;
    if (directMatchNames.has(node.name)) return true;
    return [...directMatchNames].some((name) => usedByNamesByName.get(name)?.includes(node.name));
  });
}
