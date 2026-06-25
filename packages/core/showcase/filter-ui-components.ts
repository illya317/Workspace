import {
  coreUiComponentKindMeta,
  coreUiComponentTierMeta,
  type CoreUiComponentKind,
  type CoreUiComponentTier,
} from "@workspace/core/ui/component-registry";
import { matchText } from "@workspace/core/search";

export type UiComponentFilterNode = {
  name: string;
  component: { description: string };
  kind: CoreUiComponentKind;
  tier: CoreUiComponentTier;
  verified: boolean;
};

export type UiComponentFilterInput = {
  keyword: string;
  tierValue: string;
  verifiedFilter: "verified" | "unverified" | "all";
  usageFilesByName: ReadonlyMap<string, readonly string[]>;
  usedByNamesByName: ReadonlyMap<string, readonly string[]>;
};

function matchesBaseFilters(
  node: UiComponentFilterNode,
  input: Pick<UiComponentFilterInput, "tierValue" | "verifiedFilter">,
) {
  const { tierValue, verifiedFilter } = input;
  if (tierValue !== "all" && node.tier !== tierValue) return false;
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
    || matchText(coreUiComponentKindMeta[node.kind].label, keyword)
    || matchText(coreUiComponentTierMeta[node.tier].label, keyword)
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
