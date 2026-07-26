import type {
  VisualizationNetworkEdgeSpec,
  VisualizationNetworkNodeSpec,
  VisualizationNetworkSpec,
  VisualizationTone,
} from "../../VisualizationSurfaceTypes";
import {
  annotationSize,
  createNetworkTopItems,
  groupNetworkItems,
  NETWORK_GROUP_HEADER,
  NETWORK_GROUP_MEMBER_GAP,
  networkGroupAnchorKey,
  networkNodeSize,
  networkTopTapKey,
} from "./VisualizationNetworkLayoutMetrics";
import {
  buildNetworkTree,
  createNetworkTreeMeasures,
  NETWORK_TREE_LEVEL_GAP,
  placeNetworkTree,
  resolveNetworkNodeOrientations,
} from "./VisualizationNetworkTreeLayout";
import type {
  NetworkLayoutPoint,
  PositionedNetworkData,
  PositionedNetworkEdgeData,
} from "./VisualizationNetworkLayoutTypes";
import { buildHierarchyNetworkData } from "./VisualizationNetworkHierarchyLayout";

export { networkNodeSize } from "./VisualizationNetworkLayoutMetrics";
export type {
  NetworkLayoutPoint,
  PositionedNetworkData,
  PositionedNetworkEdgeData,
  PositionedNetworkNodeData,
} from "./VisualizationNetworkLayoutTypes";

const TOP_MARGIN = 44;
const TOP_ITEM_GAP = 42;
const TOP_BUS_GAP = 76;
const FOCUS_GAP = 108;

export function buildConvergingNetworkData(visual: VisualizationNetworkSpec): PositionedNetworkData | null {
  if (visual.layout?.kind === "hierarchy") return buildHierarchyNetworkData(visual);
  const focusKey = visual.focusNodeKey;
  const focus = visual.nodes.find((node) => node.key === focusKey);
  if (!focusKey || !focus) return null;

  const nodeByKey = new Map(visual.nodes.map((node) => [node.key, node]));
  const groupByKey = new Map((visual.groups ?? []).map((group) => [group.key, group]));
  const edgesBySource = groupNetworkItems(visual.edges, (edge) => edge.source);
  const edgesByTarget = groupNetworkItems(visual.edges, (edge) => edge.target);
  const groupMembers = groupNetworkItems(
    visual.nodes.filter((node) => node.groupKey && groupByKey.has(node.groupKey)),
    (node) => node.groupKey as string,
  );
  const groupedMemberKeys = new Set([...groupMembers.values()].flat().map((node) => node.key));
  const groupAggregateEdges = new Map(
    visual.edges.filter((edge) => groupByKey.has(edge.source) && edge.target === focusKey)
      .map((edge) => [edge.source, edge]),
  );
  const ungroupedInboundEdges = (edgesByTarget.get(focusKey) ?? []).filter((edge) => (
    nodeByKey.has(edge.source) && !groupedMemberKeys.has(edge.source)
  ));

  const tree = buildNetworkTree(focusKey, nodeByKey, edgesBySource, edgesByTarget);
  const orientationByKey = resolveNetworkNodeOrientations(
    focusKey,
    tree,
    nodeByKey,
    visual.layout?.nodeAspect === "adaptive",
  );
  const measures = createNetworkTreeMeasures(tree, nodeByKey, orientationByKey);
  const rootMeasure = measures.measure(focusKey);
  const topItems = createNetworkTopItems(visual.groups ?? [], groupMembers, ungroupedInboundEdges, nodeByKey);
  const topWidth = topItems.reduce((sum, item) => sum + item.width, 0)
    + Math.max(0, topItems.length - 1) * TOP_ITEM_GAP;
  const canvasWidth = Math.max(topWidth, rootMeasure.width) + 120;
  const hasTopItems = topItems.length > 0;
  const maxTopHeight = Math.max(150, ...topItems.map((item) => item.height));
  const groupBottomY = TOP_MARGIN + (hasTopItems ? maxTopHeight : 0);
  const topBusY = groupBottomY + (hasTopItems ? TOP_BUS_GAP : 0);
  const focusY = hasTopItems
    ? topBusY + FOCUS_GAP
    : TOP_MARGIN + networkNodeSize(focus).height / 2;
  const focusX = canvasWidth / 2;
  const nodes: PositionedNetworkData["nodes"] = [];
  const edges: PositionedNetworkData["edges"] = [];
  const positions = new Map<string, NetworkLayoutPoint>();

  const addEntity = (node: VisualizationNetworkNodeSpec, x: number, y: number, combo?: string | null) => {
    if (positions.has(node.key)) return;
    const orientation = orientationByKey.get(node.key) ?? "horizontal";
    const size = networkNodeSize(node, orientation);
    positions.set(node.key, [x, y]);
    nodes.push({ id: node.key, combo, data: { kind: "entity", spec: node, orientation, ...size }, style: { x, y } });
  };
  const addAnchor = (id: string, x: number, y: number, combo?: string | null) => {
    positions.set(id, [x, y]);
    nodes.push({ id, combo, data: { kind: "anchor", width: 2, height: 2 }, style: { x, y } });
  };
  const addAnnotation = (
    id: string,
    text: string | undefined,
    x: number,
    y: number,
    role: "group-title" | "ratio",
    tone?: VisualizationTone,
    combo?: string | null,
  ) => {
    if (!text) return;
    const size = annotationSize(text, role);
    nodes.push({
      id,
      combo,
      data: { kind: "annotation", text, annotationRole: role, tone, ...size },
      style: { x, y },
    });
  };
  const addEdge = (
    id: string,
    source: string,
    target: string,
    kind: PositionedNetworkEdgeData["kind"],
    spec?: VisualizationNetworkEdgeSpec,
    controlPoints: NetworkLayoutPoint[] = [],
  ) => edges.push({ id, source, target, data: { kind, spec, controlPoints } });

  let itemLeft = (canvasWidth - topWidth) / 2;
  const topTaps: Array<{ key: string; x: number }> = [];
  for (const item of topItems) {
    if (item.kind === "group") {
      const groupTopY = groupBottomY - item.height;
      const singleton = item.members.length === 1;
      const railX = singleton ? itemLeft + item.width / 2 : itemLeft + 34;
      const anchorY = groupBottomY - 20;
      const anchorKey = networkGroupAnchorKey(item.key);
      addAnnotation(
        `group-title:${item.key}`,
        item.label,
        itemLeft + item.width / 2,
        groupTopY + 23,
        "group-title",
        item.tone,
        item.key,
      );
      addAnchor(anchorKey, railX, anchorY, item.key);
      let memberTop = groupTopY + NETWORK_GROUP_HEADER;
      for (const member of item.members) {
        const size = networkNodeSize(member);
        const memberX = singleton ? railX : itemLeft + item.width - 22 - size.width / 2;
        const memberY = memberTop + size.height / 2;
        addEntity(member, memberX, memberY, item.key);
        const memberEdge = (edgesBySource.get(member.key) ?? []).find((edge) => edge.target === focusKey);
        if (memberEdge) {
          addEdge(
            `layout-member:${memberEdge.key}`,
            member.key,
            anchorKey,
            "member",
            memberEdge,
            singleton ? [] : [[railX, memberY]],
          );
          addAnnotation(
            `ratio:${memberEdge.key}`,
            memberEdge.label,
            singleton ? memberX + 42 : railX + Math.max(32, (memberX - size.width / 2 - railX) / 2),
            singleton ? anchorY - 26 : memberY - 16,
            "ratio",
            memberEdge.tone,
            item.key,
          );
        }
        memberTop += size.height + NETWORK_GROUP_MEMBER_GAP;
      }
      const tapKey = networkTopTapKey(item.key);
      addAnchor(tapKey, railX, topBusY);
      const aggregateEdge = groupAggregateEdges.get(item.key);
      addEdge(`layout-group:${item.key}`, anchorKey, tapKey, "relation", aggregateEdge);
      if (!singleton) {
        addAnnotation(
          `ratio:group:${item.key}`,
          aggregateEdge?.label,
          railX + 44,
          groupBottomY + 27,
          "ratio",
          aggregateEdge?.tone,
        );
      }
      topTaps.push({ key: tapKey, x: railX });
    } else {
      const node = nodeByKey.get(item.source);
      if (node) {
        const size = networkNodeSize(node);
        const nodeX = itemLeft + item.width / 2;
        const nodeY = groupBottomY - 70 - size.height / 2;
        addEntity(node, nodeX, nodeY);
        const tapKey = networkTopTapKey(node.key);
        addAnchor(tapKey, nodeX, topBusY);
        addEdge(`layout-owner:${item.edge.key}`, node.key, tapKey, "relation", item.edge);
        addAnnotation(
          `ratio:${item.edge.key}`,
          item.edge.label,
          nodeX + 42,
          groupBottomY + 27,
          "ratio",
          item.edge.tone,
        );
        topTaps.push({ key: tapKey, x: nodeX });
      }
    }
    itemLeft += item.width + TOP_ITEM_GAP;
  }

  addEntity(focus, focusX, focusY);
  if (topTaps.length > 0) {
    const centerTapKey = "network-top-bus:center";
    addAnchor(centerTapKey, focusX, topBusY);
    const sortedTaps = [...topTaps, { key: centerTapKey, x: focusX }].sort((left, right) => left.x - right.x);
    addEdge("network-top-bus", sortedTaps[0]!.key, sortedTaps.at(-1)!.key, "bus");
    addEdge("network-top-drop", centerTapKey, focusKey, "drop");
  }

  const treeLeft = (canvasWidth - rootMeasure.width) / 2;
  placeNetworkTree({
    subjectKey: focusKey,
    regionLeft: treeLeft,
    subjectY: focusY,
    tree,
    measures,
    nodeByKey,
    orientationByKey,
    positions,
    addEntity,
    addAnchor,
    addAnnotation,
    addEdge,
  });

  const unplaced = visual.nodes.filter((node) => !positions.has(node.key));
  unplaced.forEach((node, index) => addEntity(node, 60 + index * 190, focusY + NETWORK_TREE_LEVEL_GAP));

  return {
    nodes,
    combos: (visual.groups ?? []).map((group) => ({ id: group.key, data: { spec: group } })),
    edges,
  };
}
