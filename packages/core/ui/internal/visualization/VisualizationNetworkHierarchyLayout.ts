import type {
  VisualizationNetworkEdgeSpec,
  VisualizationNetworkNodeSpec,
  VisualizationNetworkSpec,
} from "../../VisualizationSurfaceTypes";
import {
  centerPriorityOrder,
  explicitOrderWithCenterFallback,
  groupNetworkItems,
  networkNodeSize,
  type NetworkNodeOrientation,
} from "./VisualizationNetworkLayoutMetrics";
import type {
  NetworkLayoutPoint,
  PositionedNetworkData,
  PositionedNetworkEdgeData,
} from "./VisualizationNetworkLayoutTypes";

type HierarchyBranch = {
  key: string;
  edge?: VisualizationNetworkEdgeSpec;
  children: HierarchyBranch[];
  weight: number;
};

const ROW_GAP = 36;
const LEVEL_GAP = 72;
const VERTICAL_ROW_ASPECT = 5.5;
const HIERARCHY_RANK_GAP = 238;
const HIERARCHY_MARGIN = 56;

export function buildHierarchyNetworkData(
  visual: VisualizationNetworkSpec,
): PositionedNetworkData | null {
  const focusKey = visual.focusNodeKey;
  if (!focusKey) return null;
  const nodeByKey = new Map(visual.nodes.map((node) => [node.key, node]));
  if (!nodeByKey.has(focusKey)) return null;
  const edgesBySource = groupNetworkItems(visual.edges, (edge) => edge.source);
  const branch = buildHierarchyBranch(focusKey, edgesBySource, nodeByKey, new Set());
  const rows = collectHierarchyRows(branch);
  const orientationByKey = resolveHierarchyOrientations(rows, nodeByKey);
  const { canvasWidth, positions } = placeIndependentRows(rows, nodeByKey, orientationByKey);
  alignChildBlocks(
    branch,
    positions,
    nodeByKey,
    orientationByKey,
    HIERARCHY_MARGIN,
    canvasWidth - HIERARCHY_MARGIN,
  );

  const nodes: PositionedNetworkData["nodes"] = [];
  for (const [key, position] of positions) {
    const spec = nodeByKey.get(key);
    if (!spec) continue;
    const orientation = orientationByKey.get(key) ?? "horizontal";
    const size = networkNodeSize(spec, orientation);
    nodes.push({
      id: key,
      data: { kind: "entity", spec, orientation, ...size },
      style: { x: position[0], y: position[1] },
    });
  }

  const edges: PositionedNetworkData["edges"] = [];
  const addAnchor = (id: string, x: number, y: number) => {
    positions.set(id, [x, y]);
    nodes.push({ id, data: { kind: "anchor", width: 2, height: 2 }, style: { x, y } });
  };
  const addEdge = (
    id: string,
    source: string,
    target: string,
    kind: PositionedNetworkEdgeData["kind"],
    spec?: VisualizationNetworkEdgeSpec,
    controlPoints: NetworkLayoutPoint[] = [],
  ) => edges.push({ id, source, target, data: { kind, spec, controlPoints } });

  appendHierarchyEdges(
    branch,
    nodeByKey,
    orientationByKey,
    positions,
    addAnchor,
    addEdge,
  );
  return { nodes, combos: [], edges };
}

function buildHierarchyBranch(
  key: string,
  edgesBySource: ReadonlyMap<string, VisualizationNetworkEdgeSpec[]>,
  nodeByKey: ReadonlyMap<string, VisualizationNetworkNodeSpec>,
  path: ReadonlySet<string>,
  edge?: VisualizationNetworkEdgeSpec,
): HierarchyBranch {
  const nextPath = new Set(path).add(key);
  const rawChildren = (edgesBySource.get(key) ?? []).flatMap((childEdge) => (
    nodeByKey.has(childEdge.target) && !nextPath.has(childEdge.target)
      ? [buildHierarchyBranch(childEdge.target, edgesBySource, nodeByKey, nextPath, childEdge)]
      : []
  ));
  const horizontalWidth = rawChildren.reduce((sum, child) => (
    sum + networkNodeSize(nodeByKey.get(child.key)).width
  ), 0) + Math.max(0, rawChildren.length - 1) * ROW_GAP;
  const crowded = horizontalWidth / HIERARCHY_RANK_GAP > VERTICAL_ROW_ASPECT;
  const children = crowded
    ? centerPriorityOrder(rawChildren, (child) => child.weight, (child) => child.key)
    : explicitOrderWithCenterFallback(
      rawChildren,
      (child) => nodeByKey.get(child.key)?.layoutOrder,
      (child) => child.weight,
      (child) => child.key,
    );
  return {
    key,
    edge,
    children,
    weight: 1 + children.reduce((sum, child) => sum + child.weight, 0),
  };
}

function collectHierarchyRows(root: HierarchyBranch) {
  const rows = new Map<number, HierarchyBranch[]>();
  const queue: Array<{ branch: HierarchyBranch; depth: number }> = [{ branch: root, depth: 0 }];
  while (queue.length > 0) {
    const { branch, depth } = queue.shift() as { branch: HierarchyBranch; depth: number };
    rows.set(depth, [...(rows.get(depth) ?? []), branch]);
    queue.push(...branch.children.map((child) => ({ branch: child, depth: depth + 1 })));
  }
  return rows;
}

function resolveHierarchyOrientations(
  rows: ReadonlyMap<number, HierarchyBranch[]>,
  nodeByKey: ReadonlyMap<string, VisualizationNetworkNodeSpec>,
) {
  const orientations = new Map<string, NetworkNodeOrientation>();
  for (const [depth, row] of rows) {
    if (depth === 0) continue;
    const nodes = row.map((branch) => nodeByKey.get(branch.key))
      .filter((node): node is VisualizationNetworkNodeSpec => Boolean(node));
    const eligible = nodes.filter((node) => node.size !== "wide" && !node.subtitle);
    if (eligible.length !== nodes.length || eligible.length === 0) continue;
    const horizontalWidth = nodes.reduce((sum, node) => sum + networkNodeSize(node).width, 0)
      + Math.max(0, nodes.length - 1) * ROW_GAP;
    const rowAspect = horizontalWidth / HIERARCHY_RANK_GAP;
    if (rowAspect <= VERTICAL_ROW_ASPECT) continue;
    eligible.forEach((node) => orientations.set(node.key, "vertical"));
  }
  return orientations;
}

function placeIndependentRows(
  rows: ReadonlyMap<number, HierarchyBranch[]>,
  nodeByKey: ReadonlyMap<string, VisualizationNetworkNodeSpec>,
  orientationByKey: ReadonlyMap<string, NetworkNodeOrientation>,
) {
  const rowMetrics = [...rows.entries()].sort(([left], [right]) => left - right).map(([depth, row]) => {
    const sizes = row.map((branch) => networkNodeSize(
      nodeByKey.get(branch.key),
      orientationByKey.get(branch.key),
    ));
    return {
      depth,
      row,
      sizes,
      width: sizes.reduce((sum, size) => sum + size.width, 0) + Math.max(0, sizes.length - 1) * ROW_GAP,
      height: Math.max(0, ...sizes.map((size) => size.height)),
    };
  });
  const canvasWidth = Math.max(0, ...rowMetrics.map((row) => row.width)) + HIERARCHY_MARGIN * 2;
  const positions = new Map<string, NetworkLayoutPoint>();
  let previousBottom = HIERARCHY_MARGIN;
  for (const metric of rowMetrics) {
    const y = previousBottom + metric.height / 2;
    let left = (canvasWidth - metric.width) / 2;
    metric.row.forEach((branch, index) => {
      const size = metric.sizes[index] as { width: number; height: number };
      positions.set(branch.key, [left + size.width / 2, y]);
      left += size.width + ROW_GAP;
    });
    previousBottom = y + metric.height / 2 + LEVEL_GAP;
  }
  return { canvasWidth, positions };
}

function alignChildBlocks(
  branch: HierarchyBranch,
  positions: Map<string, NetworkLayoutPoint>,
  nodeByKey: ReadonlyMap<string, VisualizationNetworkNodeSpec>,
  orientationByKey: ReadonlyMap<string, NetworkNodeOrientation>,
  layoutLeft: number,
  layoutRight: number,
) {
  const parentPosition = positions.get(branch.key);
  const childEntries = branch.children.flatMap((child) => {
    const position = positions.get(child.key);
    const node = nodeByKey.get(child.key);
    return position && node ? [{ child, position, node }] : [];
  });
  if (parentPosition && childEntries.length > 0) {
    const childKeys = new Set(childEntries.map(({ child }) => child.key));
    const rowY = childEntries[0]!.position[1];
    const spans = childEntries.map(({ position, node }) => {
      const width = networkNodeSize(node, orientationByKey.get(node.key)).width;
      return { left: position[0] - width / 2, right: position[0] + width / 2 };
    });
    const leftEdge = Math.min(...spans.map((span) => span.left));
    const rightEdge = Math.max(...spans.map((span) => span.right));
    const currentCenter = (leftEdge + rightEdge) / 2;
    let minimumShift = layoutLeft - leftEdge;
    let maximumShift = layoutRight - rightEdge;
    for (const [otherKey, otherPosition] of positions) {
      if (childKeys.has(otherKey) || otherPosition[1] !== rowY) continue;
      const other = nodeByKey.get(otherKey);
      if (!other) continue;
      const otherWidth = networkNodeSize(other, orientationByKey.get(otherKey)).width;
      if (otherPosition[0] < currentCenter) {
        minimumShift = Math.max(
          minimumShift,
          otherPosition[0] + otherWidth / 2 + ROW_GAP - leftEdge,
        );
      } else {
        maximumShift = Math.min(
          maximumShift,
          otherPosition[0] - otherWidth / 2 - ROW_GAP - rightEdge,
        );
      }
    }
    const desiredShift = parentPosition[0] - currentCenter;
    const shift = Math.max(minimumShift, Math.min(maximumShift, desiredShift));
    if (Number.isFinite(shift) && Math.abs(shift) > 0.5) {
      childEntries.forEach(({ child, position }) => {
        positions.set(child.key, [position[0] + shift, position[1]]);
      });
    }
  }
  branch.children.forEach((child) => alignChildBlocks(
    child,
    positions,
    nodeByKey,
    orientationByKey,
    layoutLeft,
    layoutRight,
  ));
}

function appendHierarchyEdges(
  branch: HierarchyBranch,
  nodeByKey: ReadonlyMap<string, VisualizationNetworkNodeSpec>,
  orientationByKey: ReadonlyMap<string, NetworkNodeOrientation>,
  positions: ReadonlyMap<string, NetworkLayoutPoint>,
  addAnchor: (id: string, x: number, y: number) => void,
  addEdge: (
    id: string,
    source: string,
    target: string,
    kind: PositionedNetworkEdgeData["kind"],
    spec?: VisualizationNetworkEdgeSpec,
    controlPoints?: NetworkLayoutPoint[],
  ) => void,
) {
  if (branch.children.length === 0) return;
  const parentPosition = positions.get(branch.key);
  const parent = nodeByKey.get(branch.key);
  if (!parentPosition || !parent) return;
  if (branch.children.length === 1) {
    const child = branch.children[0] as HierarchyBranch;
    const childPosition = positions.get(child.key);
    const controlPoints = childPosition && childPosition[0] !== parentPosition[0]
      ? [[parentPosition[0], (parentPosition[1] + childPosition[1]) / 2], [childPosition[0], (parentPosition[1] + childPosition[1]) / 2]] as NetworkLayoutPoint[]
      : [];
    addEdge(`hierarchy-direct:${branch.key}:${child.key}`, branch.key, child.key, "drop", child.edge, controlPoints);
    appendHierarchyEdges(child, nodeByKey, orientationByKey, positions, addAnchor, addEdge);
    return;
  }

  const childPositions = branch.children.flatMap((child) => {
    const position = positions.get(child.key);
    const node = nodeByKey.get(child.key);
    return position && node ? [{ child, node, position }] : [];
  });
  if (childPositions.length === 0) return;
  const parentSize = networkNodeSize(parent, orientationByKey.get(parent.key));
  const parentBottom = parentPosition[1] + parentSize.height / 2;
  const firstChildTop = Math.min(...childPositions.map(({ node, position }) => (
    position[1] - networkNodeSize(node, orientationByKey.get(node.key)).height / 2
  )));
  const availableGap = firstChildTop - parentBottom;
  const busY = Math.min(firstChildTop - 24, parentBottom + Math.max(28, availableGap * 0.45));
  const centerKey = `hierarchy-bus:${branch.key}:center`;
  addAnchor(centerKey, parentPosition[0], busY);
  addEdge(`hierarchy-trunk:${branch.key}`, branch.key, centerKey, "bus");
  const taps = childPositions.map(({ child, position }) => {
    const key = `hierarchy-bus:${branch.key}:${child.key}`;
    addAnchor(key, position[0], busY);
    addEdge(`hierarchy-drop:${branch.key}:${child.key}`, key, child.key, "drop", child.edge);
    return { key, x: position[0] };
  });
  const busPoints = [...taps, { key: centerKey, x: parentPosition[0] }].sort((left, right) => left.x - right.x);
  addEdge(`hierarchy-row:${branch.key}`, busPoints[0]!.key, busPoints.at(-1)!.key, "bus");
  branch.children.forEach((child) => appendHierarchyEdges(
    child,
    nodeByKey,
    orientationByKey,
    positions,
    addAnchor,
    addEdge,
  ));
}
