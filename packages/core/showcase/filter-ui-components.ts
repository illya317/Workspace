import {
  coreUiComponentCategoryMeta,
  coreUiComponentSubcategoryMeta,
  type CoreUiCapabilityDescriptor,
  type CoreUiExposure,
  type CoreUiComponentCategory,
  type CoreUiComponentRole,
  type CoreUiComponentSubcategory,
} from "../ui/component-registry";
import { matchText } from "@workspace/core/search";

export type UiComponentFilterNode = {
  name: string;
  component: {
    description: string;
    exposure?: CoreUiExposure;
    role?: CoreUiComponentRole;
    declares?: readonly CoreUiCapabilityDescriptor[];
    category?: CoreUiComponentCategory;
    subcategory?: CoreUiComponentSubcategory;
  };
  verified: boolean;
};

export type UiComponentFilterInput = {
  keyword: string;
  categoryValue: string;
  roleFilter: CoreUiComponentRole | "all";
  verifiedFilter: "verified" | "unverified" | "all";
  usageFilesByName: ReadonlyMap<string, readonly string[]>;
  usedByNamesByName: ReadonlyMap<string, readonly string[]>;
};

function matchesBaseFilters(
  node: UiComponentFilterNode,
  input: Pick<UiComponentFilterInput, "categoryValue" | "roleFilter" | "verifiedFilter">,
) {
  const { categoryValue, roleFilter, verifiedFilter } = input;
  if (categoryValue !== "all" && node.component.category !== categoryValue) return false;
  if (roleFilter !== "all" && node.component.role !== roleFilter) return false;
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

  const keywordMatches = nodes.filter((node) => {
    const usageFiles = usageFilesByName.get(node.name) ?? [];
    return matchesKeyword(node, keyword, usageFiles);
  });
  const keywordMatchNames = new Set(keywordMatches.map((node) => node.name));

  return nodes.filter((node) => {
    if (!matchesBaseFilters(node, input)) return false;
    if (keywordMatchNames.has(node.name)) return true;
    return [...keywordMatchNames].some((name) => usedByNamesByName.get(name)?.includes(node.name));
  });
}
