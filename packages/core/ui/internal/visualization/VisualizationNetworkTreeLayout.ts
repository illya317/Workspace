import type {
  VisualizationNetworkEdgeSpec,
  VisualizationNetworkNodeSpec,
  VisualizationTone,
} from "../../VisualizationSurfaceTypes";
import type {
  NetworkLayoutPoint,
  PositionedNetworkEdgeData,
} from "./VisualizationNetworkLayoutTypes";
import {
  explicitOrderWithCenterFallback,
  networkNodeSize,
  networkSubjectTapKey,
  type NetworkChildMeta,
  type NetworkNodeOrientation,
} from "./VisualizationNetworkLayoutMetrics";

type NetworkTree = {
  children: Map<string, Array<{ key: string; edge: VisualizationNetworkEdgeSpec }>>;
  coOwners: Map<string, VisualizationNetworkEdgeSpec[]>;
};

type SubjectMeasure = { width: number; children: NetworkChildMeta[] };

type TreeMeasures = { measure: (subjectKey: string) => SubjectMeasure };

type TreePlacement = {
  child: NetworkChildMeta;
  childX: number;
  externalOnLeft: boolean;
  treeLeft: number;
  blockLeft: number;
};

export const NETWORK_TREE_LEVEL_GAP = 238;

const CHILD_BLOCK_GAP = 58;
const EXTERNAL_OWNER_GAP = 28;
const EXTERNAL_TO_TREE_GAP = 54;
const PARENT_TO_FAN_GAP = 54;
const CHILD_TO_LOCAL_BUS_GAP = 72;
const OWNER_TO_LOCAL_BUS_GAP = 68;
const HORIZONTAL_ROW_ASPECT = 3.2;
const VERTICAL_ROW_ASPECT = 4.2;
const ADAPTIVE_ROW_TARGET_ASPECT = 3.2;

export function buildNetworkTree(
  focusKey: string,
  nodeByKey: ReadonlyMap<string, VisualizationNetworkNodeSpec>,
  edgesBySource: ReadonlyMap<string, VisualizationNetworkEdgeSpec[]>,
  edgesByTarget: ReadonlyMap<string, VisualizationNetworkEdgeSpec[]>,
): NetworkTree {
  const children = new Map<string, Array<{ key: string; edge: VisualizationNetworkEdgeSpec }>>();
  const coOwners = new Map<string, VisualizationNetworkEdgeSpec[]>();
  const visited = new Set([focusKey]);
  const queue = [focusKey];
  while (queue.length > 0) {
    const parentKey = queue.shift() as string;
    const next = (edgesBySource.get(parentKey) ?? [])
      .filter((edge) => edge.target !== focusKey && nodeByKey.has(edge.target))
      .sort((left, right) => nodeOrder(nodeByKey.get(left.target)) - nodeOrder(nodeByKey.get(right.target)));
    for (const edge of next) {
      if (visited.has(edge.target)) continue;
      visited.add(edge.target);
      children.set(parentKey, [...(children.get(parentKey) ?? []), { key: edge.target, edge }]);
      coOwners.set(edge.target, (edgesByTarget.get(edge.target) ?? []).filter((candidate) => (
        candidate.key !== edge.key && nodeByKey.has(candidate.source)
      )));
      queue.push(edge.target);
    }
  }
  return { children, coOwners };
}

export function createNetworkTreeMeasures(
  tree: NetworkTree,
  nodeByKey: ReadonlyMap<string, VisualizationNetworkNodeSpec>,
  orientationByKey: ReadonlyMap<string, NetworkNodeOrientation> = new Map(),
): TreeMeasures {
  const cache = new Map<string, SubjectMeasure>();
  const measure = (subjectKey: string): SubjectMeasure => {
    const cached = cache.get(subjectKey);
    if (cached) return cached;
    const subjectWidth = networkNodeSize(
      nodeByKey.get(subjectKey),
      orientationByKey.get(subjectKey),
    ).width;
    const rawChildren = (tree.children.get(subjectKey) ?? []).map(({ key, edge }) => {
      const childMeasure = measure(key);
      const coOwnerEdges = tree.coOwners.get(key) ?? [];
      const externalWidth = coOwnerEdges.reduce((sum, ownerEdge) => (
        sum + networkNodeSize(nodeByKey.get(ownerEdge.source)).width
      ), 0) + Math.max(0, coOwnerEdges.length - 1) * EXTERNAL_OWNER_GAP;
      const partial = coOwnerEdges.length > 0 || (edge.value ?? 1) < 0.999999;
      return {
        key,
        edge,
        coOwnerEdges,
        treeWidth: childMeasure.width,
        externalWidth,
        blockWidth: childMeasure.width + (externalWidth > 0 ? externalWidth + EXTERNAL_TO_TREE_GAP : 0),
        partial,
      };
    });
    const partial = rawChildren.filter((child) => child.partial)
      .sort((left, right) => right.blockWidth - left.blockWidth || left.key.localeCompare(right.key));
    const centered = explicitOrderWithCenterFallback(
      rawChildren.filter((child) => !child.partial),
      (child) => nodeByKey.get(child.key)?.layoutOrder,
      (child) => child.blockWidth,
      (child) => child.key,
    );
    const left: NetworkChildMeta[] = [];
    const right: NetworkChildMeta[] = [];
    let leftWidth = 0;
    let rightWidth = 0;
    for (const child of partial) {
      // Start an equally empty row from the right so the widest partial branch
      // moves together with its external owners instead of crowding the left edge.
      if (leftWidth < rightWidth) {
        left.unshift({ ...child, side: "left" });
        leftWidth += child.blockWidth;
      } else {
        right.push({ ...child, side: "right" });
        rightWidth += child.blockWidth;
      }
    }
    const children: NetworkChildMeta[] = [
      ...left,
      ...centered.map((child): NetworkChildMeta => ({ ...child, side: "center" })),
      ...right,
    ];
    const childrenWidth = children.reduce((sum, child) => sum + child.blockWidth, 0)
      + Math.max(0, children.length - 1) * CHILD_BLOCK_GAP;
    const result = { width: Math.max(subjectWidth, childrenWidth), children };
    cache.set(subjectKey, result);
    return result;
  };
  return { measure };
}

export function placeNetworkTree(input: {
  subjectKey: string;
  regionLeft: number;
  subjectY: number;
  tree: NetworkTree;
  measures: TreeMeasures;
  nodeByKey: ReadonlyMap<string, VisualizationNetworkNodeSpec>;
  orientationByKey?: ReadonlyMap<string, NetworkNodeOrientation>;
  positions: Map<string, NetworkLayoutPoint>;
  addEntity: (node: VisualizationNetworkNodeSpec, x: number, y: number, combo?: string | null) => void;
  addAnchor: (id: string, x: number, y: number, combo?: string | null) => void;
  addAnnotation: (id: string, text: string | undefined, x: number, y: number, role: "group-title" | "ratio", tone?: VisualizationTone, combo?: string | null) => void;
  addEdge: (id: string, source: string, target: string, kind: PositionedNetworkEdgeData["kind"], spec?: VisualizationNetworkEdgeSpec, controlPoints?: NetworkLayoutPoint[]) => void;
}) {
  const measure = input.measures.measure(input.subjectKey);
  const subjectX = input.regionLeft + measure.width / 2;
  const subject = input.nodeByKey.get(input.subjectKey);
  if (subject) input.addEntity(subject, subjectX, input.subjectY);
  const placements = createChildPlacements(measure, input.regionLeft, subjectX);
  if (placements.length === 0) return;

  const subjectSize = networkNodeSize(subject, input.orientationByKey?.get(input.subjectKey));
  const fanBusY = input.subjectY + subjectSize.height / 2 + PARENT_TO_FAN_GAP;
  const fanCenterKey = `network-child-fan:${input.subjectKey}:center`;
  input.addAnchor(fanCenterKey, subjectX, fanBusY);
  input.addEdge(`network-child-trunk:${input.subjectKey}`, input.subjectKey, fanCenterKey, "bus");
  const fanTaps = placements.map(({ child, childX }) => {
    const key = `network-child-fan:${input.subjectKey}:${child.key}`;
    input.addAnchor(key, childX, fanBusY);
    return { key, x: childX };
  });
  if (placements.length > 1) {
    const fanPoints = [...fanTaps, { key: fanCenterKey, x: subjectX }]
      .sort((left, right) => left.x - right.x);
    input.addEdge(`network-child-fan-bus:${input.subjectKey}`, fanPoints[0]!.key, fanPoints.at(-1)!.key, "bus");
  }

  const childY = input.subjectY + NETWORK_TREE_LEVEL_GAP;
  placements.forEach((placement) => placeChild({ ...input, placement, childY, fanBusY }));
}

function createChildPlacements(
  measure: SubjectMeasure,
  regionLeft: number,
  subjectX: number,
): TreePlacement[] {
  if (measure.children.length === 1) {
    const child = measure.children[0] as NetworkChildMeta;
    const externalOnLeft = false;
    const treeLeft = subjectX - child.treeWidth / 2;
    return [{
      child,
      childX: subjectX,
      externalOnLeft,
      treeLeft,
      blockLeft: externalOnLeft && child.externalWidth > 0
        ? treeLeft - child.externalWidth - EXTERNAL_TO_TREE_GAP
        : treeLeft,
    }];
  }

  const childrenWidth = measure.children.reduce((sum, child) => sum + child.blockWidth, 0)
    + Math.max(0, measure.children.length - 1) * CHILD_BLOCK_GAP;
  let blockLeft = regionLeft + (measure.width - childrenWidth) / 2;
  const placements = measure.children.map((child) => {
    const externalOnLeft = child.side === "left";
    const treeLeft = blockLeft + (externalOnLeft && child.externalWidth > 0
      ? child.externalWidth + EXTERNAL_TO_TREE_GAP
      : 0);
    const placement = { child, externalOnLeft, treeLeft, childX: treeLeft + child.treeWidth / 2, blockLeft };
    blockLeft += child.blockWidth + CHILD_BLOCK_GAP;
    return placement;
  });
  const directChildrenCenter = (
    Math.min(...placements.map((placement) => placement.childX))
    + Math.max(...placements.map((placement) => placement.childX))
  ) / 2;
  const shiftX = subjectX - directChildrenCenter;
  return placements.map((placement) => ({
    ...placement,
    childX: placement.childX + shiftX,
    treeLeft: placement.treeLeft + shiftX,
    blockLeft: placement.blockLeft + shiftX,
  }));
}

function placeChild(input: Parameters<typeof placeNetworkTree>[0] & {
  placement: TreePlacement;
  childY: number;
  fanBusY: number;
}) {
  const { child, externalOnLeft, treeLeft, childX, blockLeft } = input.placement;
  const fanTapKey = `network-child-fan:${input.subjectKey}:${child.key}`;
  const localBusY = input.childY - CHILD_TO_LOCAL_BUS_GAP;
  const localTapKey = networkSubjectTapKey(child.key);
  input.addAnchor(localTapKey, childX, localBusY);
  input.addEdge(`layout-parent:${child.edge.key}`, fanTapKey, localTapKey, "relation", child.edge);
  input.addAnnotation(
    `ratio:${child.edge.key}`,
    child.edge.label,
    childX + 42,
    input.fanBusY + (localBusY - input.fanBusY) / 2,
    "ratio",
    child.edge.tone,
  );

  const ownerY = localBusY - OWNER_TO_LOCAL_BUS_GAP;
  const ownerWidths = child.coOwnerEdges.map((edge) => networkNodeSize(
    input.nodeByKey.get(edge.source),
    input.orientationByKey?.get(edge.source),
  ).width);
  let ownerLeft = externalOnLeft
    ? blockLeft
    : treeLeft + child.treeWidth + (child.externalWidth > 0 ? EXTERNAL_TO_TREE_GAP : 0);
  const ownerTapKeys: Array<{ key: string; x: number }> = [];
  child.coOwnerEdges.forEach((ownerEdge, ownerIndex) => {
    const owner = input.nodeByKey.get(ownerEdge.source);
    if (!owner) return;
    const width = ownerWidths[ownerIndex] ?? networkNodeSize(
      owner,
      input.orientationByKey?.get(owner.key),
    ).width;
    const ownerX = ownerLeft + width / 2;
    input.addEntity(owner, ownerX, ownerY);
    const ownerTapKey = `${localTapKey}:owner:${ownerIndex}`;
    input.addAnchor(ownerTapKey, ownerX, localBusY);
    input.addEdge(`layout-owner:${ownerEdge.key}`, owner.key, ownerTapKey, "relation", ownerEdge);
    input.addAnnotation(
      `ratio:${ownerEdge.key}`,
      ownerEdge.label,
      ownerX + 36,
      ownerY + OWNER_TO_LOCAL_BUS_GAP / 2,
      "ratio",
      ownerEdge.tone,
    );
    ownerTapKeys.push({ key: ownerTapKey, x: ownerX });
    ownerLeft += width + EXTERNAL_OWNER_GAP;
  });
  if (ownerTapKeys.length > 0) {
    const busPoints = [...ownerTapKeys, { key: localTapKey, x: childX }]
      .sort((left, right) => left.x - right.x);
    input.addEdge(`network-child-bus:${child.key}`, busPoints[0]!.key, busPoints.at(-1)!.key, "bus");
  }
  input.addEdge(`network-child-drop:${child.key}`, localTapKey, child.key, "drop");

  placeNetworkTree({
    ...input,
    subjectKey: child.key,
    regionLeft: treeLeft,
    subjectY: input.childY,
  });
}

export function resolveNetworkNodeOrientations(
  focusKey: string,
  tree: NetworkTree,
  nodeByKey: ReadonlyMap<string, VisualizationNetworkNodeSpec>,
  adaptive: boolean,
) {
  const orientations = new Map<string, NetworkNodeOrientation>();
  if (!adaptive) return orientations;
  const queue = [focusKey];
  while (queue.length > 0) {
    const parentKey = queue.shift() as string;
    const children = (tree.children.get(parentKey) ?? [])
      .map((child) => nodeByKey.get(child.key))
      .filter((child): child is VisualizationNetworkNodeSpec => Boolean(child));
    queue.push(...children.map((child) => child.key));
    const eligible = children.filter((child) => child.size !== "wide" && !child.subtitle);
    if (eligible.length === 0) continue;
    const horizontalWidths = new Map(eligible.map((child) => [child.key, networkNodeSize(child).width]));
    const rowWidth = children.reduce((sum, child) => sum + networkNodeSize(child).width, 0)
      + Math.max(0, children.length - 1) * CHILD_BLOCK_GAP;
    const rowAspect = rowWidth / NETWORK_TREE_LEVEL_GAP;
    if (rowAspect <= HORIZONTAL_ROW_ASPECT) continue;
    const candidates = [...eligible].sort((left, right) => (
      (horizontalWidths.get(right.key) ?? 0) - (horizontalWidths.get(left.key) ?? 0)
      || left.key.localeCompare(right.key)
    ));
    const selected = rowAspect >= VERTICAL_ROW_ASPECT ? candidates : [];
    let adaptiveWidth = rowWidth;
    for (const child of selected) {
      adaptiveWidth -= (horizontalWidths.get(child.key) ?? 0) - networkNodeSize(child, "vertical").width;
    }
    if (selected.length === 0) {
      for (const child of candidates) {
        selected.push(child);
        adaptiveWidth -= (horizontalWidths.get(child.key) ?? 0) - networkNodeSize(child, "vertical").width;
        if (adaptiveWidth / NETWORK_TREE_LEVEL_GAP <= ADAPTIVE_ROW_TARGET_ASPECT) break;
      }
    }
    selected.forEach((child) => orientations.set(child.key, "vertical"));
  }
  return orientations;
}

function nodeOrder(node?: VisualizationNetworkNodeSpec) {
  return node?.layoutOrder ?? Number.MAX_SAFE_INTEGER;
}
