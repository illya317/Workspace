import assert from "node:assert/strict";
import test from "node:test";

import {
  compactMapNodeLabel,
  layoutMapNetworkLabels,
  MAP_PRIMARY_LABEL_FONT_SIZE,
  MAP_RELATED_LABEL_FONT_SIZE,
  type MapNetworkLabelLayout,
} from "./VisualizationNetworkMapLabelLayout";

type ScreenNode = Parameters<typeof layoutMapNetworkLabels>[0]["nodes"][number];

function overlaps(left: MapNetworkLabelLayout, right: MapNetworkLabelLayout) {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function intersectsNode(label: MapNetworkLabelLayout, node: ScreenNode) {
  const closestX = Math.max(label.left, Math.min(node.x, label.right));
  const closestY = Math.max(label.top, Math.min(node.y, label.bottom));
  return (node.x - closestX) ** 2 + (node.y - closestY) ** 2 < node.radius ** 2;
}

test("map screen labels keep fixed font tokens and compact camel-case names", () => {
  assert.equal(MAP_PRIMARY_LABEL_FONT_SIZE, 13);
  assert.equal(MAP_RELATED_LABEL_FONT_SIZE, 12);
  assert.equal(compactMapNodeLabel("DepartmentCollaboration"), "Department\nCollaboration");
  assert.equal(compactMapNodeLabel("部门"), "部门");
});

test("overview selection lays out only its root label without touching circles", () => {
  const nodes: ScreenNode[] = [
    { key: "root", label: "User", x: 220, y: 180, radius: 24, degree: 12 },
    { key: "neighbor", label: "WorkItem", x: 220, y: 235, radius: 18, degree: 3 },
  ];
  const labels = layoutMapNetworkLabels({
    nodes,
    selection: { rootNodeKey: "root", relatedNodeKeys: [] },
    width: 520,
    height: 380,
  });

  assert.deepEqual(labels.map((label) => label.key), ["root"]);
  assert.equal(labels[0]?.primary, true);
  assert.equal(nodes.some((node) => intersectsNode(labels[0]!, node)), false);
});

test("focused label layout avoids every circle and every previously placed label", () => {
  const nodes: ScreenNode[] = [
    { key: "root", label: "User", x: 320, y: 260, radius: 28, degree: 24 },
    ...Array.from({ length: 10 }, (_, index) => {
      const angle = index / 10 * Math.PI * 2;
      return {
        key: `node-${index}`,
        label: `RelatedTable${index}`,
        x: 320 + Math.cos(angle) * 125,
        y: 260 + Math.sin(angle) * 125,
        radius: 18,
        degree: 10 - index,
      };
    }),
  ];
  const labels = layoutMapNetworkLabels({
    nodes,
    selection: { rootNodeKey: "root", relatedNodeKeys: nodes.slice(1).map((node) => node.key) },
    width: 640,
    height: 520,
  });

  assert.equal(labels.some((label) => nodes.some((node) => intersectsNode(label, node))), false);
  assert.equal(labels.some((label, index) => labels.slice(index + 1).some((other) => overlaps(label, other))), false);
});

test("dense detail layouts deterministically cull labels that cannot fit", () => {
  const nodes: ScreenNode[] = [
    { key: "root", label: "Center", x: 180, y: 150, radius: 24, degree: 30 },
    ...Array.from({ length: 24 }, (_, index) => ({
      key: `dense-${index}`,
      label: `DenseRelation${index}`,
      x: 180 + (index % 6 - 2.5) * 38,
      y: 150 + (Math.floor(index / 6) - 1.5) * 38,
      radius: 13,
      degree: 24 - index,
    })),
  ];
  const input = {
    nodes,
    selection: { rootNodeKey: "root", relatedNodeKeys: nodes.slice(1).map((node) => node.key) },
    width: 360,
    height: 300,
  };
  const first = layoutMapNetworkLabels(input);
  const second = layoutMapNetworkLabels(input);

  assert.deepEqual(second, first);
  assert.ok(first.length < nodes.length);
  assert.equal(first[0]?.key, "root");
});
