import assert from "node:assert/strict";
import test from "node:test";
import type { EdgeData, NodeData } from "@antv/g6";

import type { VisualizationNetworkSpec } from "../../VisualizationSurfaceTypes";
import {
  buildMapNetworkData,
  createMapNetworkBehaviors,
  MAP_EDGE_STATES,
  MAP_NODE_STATES,
  mapEdgeStyle,
  mapNodeDiameter,
  mapNodeStyle,
  type MapNetworkNodeDatum,
} from "./VisualizationNetworkMap";
import { createMapNetworkLayout } from "./VisualizationNetworkMapLayout";
import {
  createMapNetworkViewport,
  MAP_MIN_ZOOM,
} from "./VisualizationNetworkMapViewport";

function nodeData(visual: VisualizationNetworkSpec, key: string) {
  const node = buildMapNetworkData(visual).nodes.find((item) => item.id === key);
  assert.ok(node);
  return node.data as MapNetworkNodeDatum;
}

test("map network derives node prominence from relationship degree", () => {
  const visual: VisualizationNetworkSpec = {
    kind: "network",
    presentation: "map",
    nodes: [
      { key: "hub", label: "Hub" },
      { key: "leaf-a", label: "Leaf A" },
      { key: "leaf-b", label: "Leaf B" },
      { key: "isolated", label: "Isolated" },
    ],
    edges: [
      { key: "hub-a", source: "hub", target: "leaf-a" },
      { key: "hub-b", source: "hub", target: "leaf-b" },
    ],
  };

  const hub = nodeData(visual, "hub");
  const leaf = nodeData(visual, "leaf-a");
  const isolated = nodeData(visual, "isolated");
  assert.equal(hub.degree, 2);
  assert.equal(leaf.degree, 1);
  assert.equal(isolated.degree, 0);
  assert.ok(hub.diameter > leaf.diameter);
  assert.ok(leaf.diameter > isolated.diameter);
  const layout = createMapNetworkLayout(visual.nodes.length);
  assert.equal(layout.nodeSize({ data: hub }), hub.diameter);
  assert.equal(layout.nodeSpacing, 22);
  assert.equal(layout.type, "d3-force");
  assert.equal(layout.clustering, true);
  assert.equal(layout.clusterBy({ data: hub }), hub.communityKey);
});

test("map uses FK topology communities instead of one giant connected component", () => {
  const cliqueEdges = (prefix: string) => {
    const edges = [];
    for (let left = 1; left <= 4; left += 1) {
      for (let right = left + 1; right <= 4; right += 1) {
        edges.push({
          key: `${prefix}-${left}-${right}`,
          source: `${prefix}${left}`,
          target: `${prefix}${right}`,
        });
      }
    }
    return edges;
  };
  const visual: VisualizationNetworkSpec = {
    kind: "network",
    presentation: "map",
    nodes: ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4", "isolated"]
      .map((key) => ({ key, label: key })),
    edges: [
      ...cliqueEdges("a"),
      ...cliqueEdges("b"),
      { key: "bridge", source: "a4", target: "b1" },
      { key: "self", source: "isolated", target: "isolated" },
    ],
  };

  const data = buildMapNetworkData(visual);
  const communities = Object.fromEntries(data.nodes.map((node) => [node.id, node.data.communityKey]));
  assert.equal(communities.a1, communities.a2);
  assert.equal(communities.a2, communities.a3);
  assert.equal(communities.b1, communities.b2);
  assert.equal(communities.b2, communities.b3);
  assert.notEqual(communities.a1, communities.b1);
  assert.notEqual(communities.a1, communities.isolated);
  assert.notEqual(communities.b1, communities.isolated);
});

test("map coarsens many tiny Louvain results into a readable number of communities", () => {
  const nodes = Array.from({ length: 48 }, (_, index) => ({
    key: `node-${index}`,
    label: `Node ${index}`,
  }));
  const edges = [];
  for (let cluster = 0; cluster < 12; cluster += 1) {
    const offset = cluster * 4;
    for (let left = 0; left < 4; left += 1) {
      for (let right = left + 1; right < 4; right += 1) {
        edges.push({
          key: `dense-${cluster}-${left}-${right}`,
          source: `node-${offset + left}`,
          target: `node-${offset + right}`,
        });
      }
    }
    if (cluster > 0) {
      edges.push({
        key: `bridge-${cluster}`,
        source: `node-${offset - 1}`,
        target: `node-${offset}`,
      });
    }
  }
  const data = buildMapNetworkData({ kind: "network", presentation: "map", nodes, edges });
  const communityCount = new Set(data.nodes.map((node) => node.data.communityKey)).size;

  assert.ok(communityCount > 1);
  assert.ok(communityCount <= 4);
});

test("map nodes stay as unlabeled circles until hover regardless of degree", () => {
  const nodes = Array.from({ length: 40 }, (_, index) => ({
    key: `node-${index}`,
    label: `Node ${index}`,
  }));
  const visual: VisualizationNetworkSpec = {
    kind: "network",
    presentation: "map",
    nodes,
    edges: nodes.slice(1, 20).map((node, index) => ({
      key: `edge-${index}`,
      source: "node-0",
      target: node.key,
    })),
  };

  const hubStyle = mapNodeStyle({ data: nodeData(visual, "node-0") } as unknown as NodeData);
  const leafStyle = mapNodeStyle({ data: nodeData(visual, "node-39") } as unknown as NodeData);

  assert.equal(hubStyle.labelOpacity, 0);
  assert.equal(leafStyle.labelOpacity, 0);
  assert.equal(hubStyle.labelPlacement, "bottom");
  assert.equal(MAP_NODE_STATES.selected.labelOpacity, 0);
  assert.equal(MAP_NODE_STATES.hovered.labelOpacity, 1);
  assert.equal(MAP_NODE_STATES.outgoing.labelOpacity, 1);
  assert.equal(MAP_NODE_STATES.outgoing.fill, "#c77a32");
  assert.equal(MAP_NODE_STATES.incoming.fill, "#5f82ad");
});

test("self references use an orange node border instead of a visual loop", () => {
  const visual: VisualizationNetworkSpec = {
    kind: "network",
    presentation: "map",
    nodes: [
      { key: "self", label: "SelfReference" },
      { key: "target", label: "Target" },
    ],
    edges: [
      { key: "self-loop", source: "self", target: "self" },
      { key: "outgoing", source: "self", target: "target" },
    ],
  };
  const data = buildMapNetworkData(visual);
  const self = nodeData(visual, "self");
  const style = mapNodeStyle({ data: self } as unknown as NodeData);

  assert.equal(self.selfReference, true);
  assert.equal(self.degree, 2);
  assert.deepEqual(data.edges.map((edge) => edge.id), ["outgoing"]);
  assert.equal(style.fill, "#626262");
  assert.equal(style.stroke, "#8b6a3f");
  assert.equal(style.lineWidth, 1.5);
  assert.equal(style.labelText, "SelfReference");
});

test("map uses Obsidian-like neutral circles instead of business-domain colors", () => {
  const visual: VisualizationNetworkSpec = {
    kind: "network",
    presentation: "map",
    nodes: [
      { key: "blue", label: "Blue", tone: "blue" },
      { key: "rose", label: "Rose", tone: "rose" },
    ],
    edges: [],
  };

  const blueStyle = mapNodeStyle({ data: nodeData(visual, "blue") } as unknown as NodeData);
  const roseStyle = mapNodeStyle({ data: nodeData(visual, "rose") } as unknown as NodeData);
  assert.equal(blueStyle.fill, "#626262");
  assert.equal(roseStyle.fill, "#626262");
  assert.equal(blueStyle.stroke, roseStyle.stroke);
});

test("focused local maps keep the focus size degree-driven without a default label", () => {
  const visual: VisualizationNetworkSpec = {
    kind: "network",
    presentation: "map",
    focusNodeKey: "center",
    nodes: [
      { key: "center", label: "Center" },
      { key: "neighbor-a", label: "Neighbor A" },
      { key: "neighbor-b", label: "Neighbor B" },
    ],
    edges: [
      { key: "a", source: "center", target: "neighbor-a" },
      { key: "b", source: "center", target: "neighbor-b" },
    ],
  };

  assert.equal(nodeData(visual, "center").diameter, mapNodeDiameter(2));
  assert.equal(
    mapNodeStyle({ data: nodeData(visual, "center") } as unknown as NodeData).labelOpacity,
    0,
  );
});

test("map node diameter follows FK degree on a soft saturation curve", () => {
  const diameters = [0, 1, 3, 7, 15, 31, 63, 255, 1000]
    .map((degree) => Math.round(mapNodeDiameter(degree) * 10) / 10);

  assert.deepEqual(diameters, [8, 13.3, 16.2, 19.1, 22, 24.9, 27.6, 32.4, 35.6]);
  assert.ok(mapNodeDiameter(10_000) > mapNodeDiameter(1_000));
  assert.ok(mapNodeDiameter(10_000) < 40);
  assert.ok(mapNodeDiameter(1) - mapNodeDiameter(0) > mapNodeDiameter(32) - mapNodeDiameter(31));
});

test("map leaves hover and selection state to the controlled interaction layer", () => {
  assert.deepEqual(createMapNetworkBehaviors(), [
    "drag-canvas",
    "zoom-canvas",
  ]);
});

test("map keeps a readable minimum zoom instead of shrinking the topology to a thumbnail", () => {
  assert.deepEqual(createMapNetworkViewport(), {
    autoFit: {
      type: "view",
      options: { when: "always", direction: "both" },
      animation: false,
    },
    padding: 32,
    zoomRange: [MAP_MIN_ZOOM, 6],
  });
  assert.equal(MAP_MIN_ZOOM, 0.5);
});

test("map labels and halos do not expand the node hit area", () => {
  const datum = nodeData({
    kind: "network",
    presentation: "map",
    nodes: [{ key: "node", label: "A very long table name" }],
    edges: [],
  }, "node");
  const style = mapNodeStyle({ data: datum } as unknown as NodeData);

  assert.equal(style.labelPointerEvents, "none");
  assert.equal(style.labelBackgroundPointerEvents, "none");
  assert.equal(style.haloPointerEvents, "none");
});

test("map labels stay compact and clear the highlighted node", () => {
  const datum = nodeData({
    kind: "network",
    presentation: "map",
    nodes: [{ key: "node", label: "DepartmentCollaboration" }],
    edges: [],
  }, "node");
  const style = mapNodeStyle({ data: datum } as unknown as NodeData);

  assert.equal(style.labelText, "Department\nCollaboration");
  assert.equal(style.labelFontSize, 9);
  assert.equal(style.labelMaxLines, 2);
  assert.equal(style.labelOffsetY, datum.diameter / 2 + 8);
  assert.equal(style.labelBackgroundFillOpacity, 0.96);
});

test("map edges remain readable before hover without becoming visually heavy", () => {
  const style = mapEdgeStyle({
    data: {
      kind: "relation",
      spec: { key: "edge", source: "source", target: "target", tone: "slate" },
    },
  } as unknown as EdgeData);

  assert.equal(style.strokeOpacity, 0.42);
  assert.equal(style.lineWidth, 0.8);
  assert.equal(style.stroke, "#9ca3ab");
  assert.equal(style.startArrow, false);
  assert.equal(style.endArrow, false);
  assert.equal(MAP_EDGE_STATES.active.endArrow, false);
  assert.equal(MAP_EDGE_STATES.selected.endArrow, false);
  assert.equal(MAP_EDGE_STATES.outgoing.stroke, "#c77a32");
  assert.equal(MAP_EDGE_STATES.incoming.stroke, "#5f82ad");
});
