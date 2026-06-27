import {
  coreUiComponentKindMeta,
  coreUiComponentOwnerL1Meta,
  coreUiComponentOwnerL2Meta,
  type CoreUiComponentAccessLayer,
  type CoreUiComponentKind,
  type CoreUiComponentOwnerL1,
  type CoreUiComponentOwnerL2,
  type CoreUiComponentUiLevel,
} from "@workspace/core/ui/component-registry";
import { matchText } from "@workspace/core/search";

export type UiComponentFilterNode = {
  name: string;
  kind: CoreUiComponentKind;
  accessLayer: CoreUiComponentAccessLayer;
  uiLevel: CoreUiComponentUiLevel;
  component: {
    description: string;
    ownerL1?: CoreUiComponentOwnerL1;
    ownerL2?: CoreUiComponentOwnerL2;
  };
  verified: boolean;
};

export type UiComponentFilterInput = {
  keyword: string;
  ownerL1Value: string;
  verifiedFilter: "verified" | "unverified" | "all";
  usageFilesByName: ReadonlyMap<string, readonly string[]>;
  usedByNamesByName: ReadonlyMap<string, readonly string[]>;
};

function matchesBaseFilters(
  node: UiComponentFilterNode,
  input: Pick<UiComponentFilterInput, "ownerL1Value" | "verifiedFilter">,
) {
  const { ownerL1Value, verifiedFilter } = input;
  if (ownerL1Value !== "all" && node.component.ownerL1 !== ownerL1Value) return false;
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
    || Boolean(node.component.ownerL1 && (
      matchText(node.component.ownerL1, keyword)
      || matchText(coreUiComponentOwnerL1Meta[node.component.ownerL1].label, keyword)
    ))
    || Boolean(node.component.ownerL2 && (
      matchText(node.component.ownerL2, keyword)
      || matchText(coreUiComponentOwnerL2Meta[node.component.ownerL2].label, keyword)
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
