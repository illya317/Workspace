import type {
  VisualizationNetworkEdgeSpec,
  VisualizationNetworkGroupSpec,
  VisualizationNetworkNodeSpec,
  VisualizationTone,
} from "../../VisualizationSurfaceTypes";

export type NetworkNodeSize = { width: number; height: number };

export type NetworkChildMeta = {
  key: string;
  edge: VisualizationNetworkEdgeSpec;
  coOwnerEdges: VisualizationNetworkEdgeSpec[];
  treeWidth: number;
  externalWidth: number;
  blockWidth: number;
  side: "left" | "center" | "right";
};

export type NetworkNodeOrientation = "horizontal" | "vertical";

export type NetworkTopItem =
  | {
    kind: "group";
    key: string;
    label: string;
    tone?: VisualizationTone;
    order?: number;
    width: number;
    height: number;
    members: VisualizationNetworkNodeSpec[];
  }
  | {
    kind: "node";
    key: string;
    source: string;
    edge: VisualizationNetworkEdgeSpec;
    order?: number;
    width: number;
    height: number;
  };

export const NETWORK_GROUP_HEADER = 52;
export const NETWORK_GROUP_MEMBER_GAP = 24;

const GROUP_BOTTOM = 34;
const GROUP_RAIL_WIDTH = 86;

export function createNetworkTopItems(
  groups: readonly VisualizationNetworkGroupSpec[],
  membersByGroup: ReadonlyMap<string, VisualizationNetworkNodeSpec[]>,
  ungroupedEdges: readonly VisualizationNetworkEdgeSpec[],
  nodeByKey: ReadonlyMap<string, VisualizationNetworkNodeSpec>,
) {
  const items: NetworkTopItem[] = [];
  for (const group of groups) {
    const members = [...(membersByGroup.get(group.key) ?? [])]
      .sort((left, right) => nodeOrder(left) - nodeOrder(right) || left.key.localeCompare(right.key));
    if (members.length === 0) continue;
    const memberSizes = members.map((member) => networkNodeSize(member));
    const singleton = members.length === 1;
    const width = Math.max(
      220,
      annotationSize(group.label, "group-title").width + 42,
      ...memberSizes.map((size) => size.width + (singleton ? 44 : GROUP_RAIL_WIDTH + 28)),
    );
    const height = NETWORK_GROUP_HEADER + memberSizes.reduce((sum, size) => sum + size.height, 0)
      + Math.max(0, members.length - 1) * NETWORK_GROUP_MEMBER_GAP + GROUP_BOTTOM;
    items.push({
      kind: "group",
      key: group.key,
      label: group.label,
      tone: group.tone,
      order: group.layoutOrder,
      width,
      height,
      members,
    });
  }
  for (const edge of ungroupedEdges) {
    const node = nodeByKey.get(edge.source);
    if (!node) continue;
    const size = networkNodeSize(node);
    items.push({
      kind: "node",
      key: node.key,
      source: node.key,
      edge,
      order: node.layoutOrder,
      width: size.width + 56,
      height: size.height + 150,
    });
  }
  return arrangeNetworkTopItems(items);
}

export function networkNodeSize(
  node?: VisualizationNetworkNodeSpec,
  orientation: NetworkNodeOrientation = "horizontal",
): NetworkNodeSize {
  if (orientation === "vertical") {
    return {
      width: 82,
      height: 184,
    };
  }
  const base = node?.size === "wide"
    ? { width: 390, height: 62 }
    : node?.size === "compact"
      ? { width: 146, height: 54 }
      : { width: 176, height: 58 };
  const subtitleWidth = visualTextWidth(node?.subtitle ?? "");
  const width = node?.subtitle && node.size !== "wide" ? Math.max(base.width, 224) : base.width;
  const subtitleLines = node?.subtitle ? Math.max(1, Math.ceil(subtitleWidth / (width - 32))) : 0;
  const labelWidth = Math.min(node?.size === "wide" ? 520 : 260, visualTextWidth(node?.label ?? "") + 40);
  return {
    width: Math.max(width, labelWidth),
    height: Math.max(base.height, node?.subtitle ? 44 + subtitleLines * 19 : base.height),
  };
}

function arrangeNetworkTopItems(items: NetworkTopItem[]) {
  return explicitOrderWithCenterFallback(
    items,
    (item) => item.order,
    (item) => item.width,
    (item) => item.key,
  );
}

export function explicitOrderWithCenterFallback<T>(
  items: readonly T[],
  order: (item: T) => number | undefined,
  priority: (item: T) => number,
  key: (item: T) => string,
) {
  const ordered = items
    .filter((item) => order(item) !== undefined)
    .sort((left, right) => (order(left) as number) - (order(right) as number) || key(left).localeCompare(key(right)));
  const unordered = centerPriorityOrder(items.filter((item) => order(item) === undefined), priority, key);
  if (ordered.length === 0) return unordered;
  if (unordered.length === 0) return ordered;
  const insertAt = Math.ceil(ordered.length / 2);
  return [...ordered.slice(0, insertAt), ...unordered, ...ordered.slice(insertAt)];
}

export function centerPriorityOrder<T>(
  items: readonly T[],
  priority: (item: T) => number,
  key: (item: T) => string,
) {
  const prioritized = [...items].sort((left, right) => (
    priority(right) - priority(left) || key(left).localeCompare(key(right))
  ));
  const slots = new Array<T>(prioritized.length);
  const center = (prioritized.length - 1) / 2;
  const slotOrder = Array.from({ length: prioritized.length }, (_, index) => index)
    .sort((left, right) => Math.abs(left - center) - Math.abs(right - center) || left - right);
  prioritized.forEach((item, index) => {
    slots[slotOrder[index] as number] = item;
  });
  return slots;
}

export function annotationSize(text: string, role: "group-title" | "ratio"): NetworkNodeSize {
  return {
    width: visualTextWidth(text) + (role === "group-title" ? 24 : 8),
    height: role === "group-title" ? 28 : 20,
  };
}

export function networkGroupAnchorKey(groupKey: string) {
  return `network-group-anchor:${groupKey}`;
}

export function networkTopTapKey(sourceKey: string) {
  return `network-top-tap:${sourceKey}`;
}

export function networkSubjectTapKey(subjectKey: string) {
  return `network-subject-tap:${subjectKey}`;
}

export function groupNetworkItems<T, K>(items: readonly T[], keyFor: (item: T) => K) {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function visualTextWidth(value: string) {
  return [...value].reduce((sum, character) => sum + (/^[\x00-\xff]$/.test(character) ? 7.5 : 14), 0);
}

function nodeOrder(node?: VisualizationNetworkNodeSpec) {
  return node?.layoutOrder ?? Number.MAX_SAFE_INTEGER;
}
