import assert from "node:assert/strict";
import test from "node:test";

import type { VisualizationNetworkSpec } from "../../VisualizationSurfaceTypes";
import { buildConvergingNetworkData } from "./VisualizationNetworkLayout";

const visual: VisualizationNetworkSpec = {
  kind: "network",
  focusNodeKey: "issuer",
  groups: [{ key: "group-a", label: "示例分组", outlined: true, layoutOrder: 10 }],
  nodes: [
    { key: "owner-a", label: "股东甲", groupKey: "group-a", size: "compact", layoutOrder: 10 },
    { key: "owner-b", label: "股东乙", groupKey: "group-a", size: "compact", layoutOrder: 20 },
    { key: "owner-c", label: "股东丙", size: "compact", layoutOrder: 30 },
    { key: "issuer", label: "主体公司", size: "wide", emphasis: "focus", layoutOrder: 40 },
    { key: "partial", label: "非全资子公司", layoutOrder: 50 },
    { key: "full", label: "全资子公司", layoutOrder: 60 },
    { key: "partial-light", label: "另一家非全资子公司", layoutOrder: 65 },
    { key: "outside", label: "外部股东", size: "compact", layoutOrder: 70 },
    { key: "outside-b", label: "外部股东乙", size: "compact", layoutOrder: 75 },
    { key: "grandchild", label: "下级公司", layoutOrder: 80 },
  ],
  edges: [
    { key: "member-a", source: "owner-a", target: "issuer", label: "30.00%", value: 0.3 },
    { key: "member-b", source: "owner-b", target: "issuer", label: "20.00%", value: 0.2 },
    { key: "group-total", source: "group-a", target: "issuer", label: "50.00%", value: 0.5 },
    { key: "owner-c-total", source: "owner-c", target: "issuer", label: "50.00%", value: 0.5 },
    { key: "issuer-partial", source: "issuer", target: "partial", label: "60.00%", value: 0.6 },
    { key: "outside-partial", source: "outside", target: "partial", label: "40.00%", value: 0.4 },
    { key: "outside-b-partial", source: "outside-b", target: "partial", label: "5.00%", value: 0.05 },
    { key: "issuer-full", source: "issuer", target: "full", label: "100.00%", value: 1 },
    { key: "issuer-partial-light", source: "issuer", target: "partial-light", label: "75.00%", value: 0.75 },
    { key: "partial-grandchild", source: "partial", target: "grandchild", label: "100.00%", value: 1 },
  ],
};

test("the converging layout keeps partial subsidiaries and external owners on the same outer side", () => {
  const layout = buildConvergingNetworkData(visual);
  assert.ok(layout);
  const position = (id: string) => {
    const node = layout.nodes.find((candidate) => candidate.id === id);
    assert.ok(node, `missing positioned node ${id}`);
    return node.style;
  };
  const leftEdge = (id: string) => {
    const node = layout.nodes.find((candidate) => candidate.id === id);
    assert.ok(node, `missing positioned node ${id}`);
    return node.style.x - node.data.width / 2;
  };

  assert.equal(position("owner-a").x, position("owner-b").x);
  assert.ok(position("owner-a").y < position("owner-b").y);
  assert.ok(position("owner-a").y < position("issuer").y);
  assert.ok(position("outside").y < position("partial").y);
  assert.ok(position("issuer").y < position("partial").y);
  assert.ok(position("partial").y < position("grandchild").y);
  assert.ok(position("partial-light").x < position("full").x);
  assert.ok(position("full").x < position("partial").x);
  assert.ok(position("partial").x < position("outside").x);
  assert.ok(position("outside").x < position("outside-b").x);
  assert.ok(leftEdge("outside") > position("partial").x);
  assert.equal((position("partial-light").x + position("partial").x) / 2, position("issuer").x);
  assert.ok(position("outside").y > position("issuer").y);
  assert.ok(position("outside").y < position("partial").y);
  assert.equal(layout.nodes.find((node) => node.id === "owner-a")?.data.spec?.label, "股东甲");
  assert.equal(layout.edges.filter((edge) => edge.id === "network-child-trunk:issuer").length, 1);
  assert.equal(layout.edges.filter((edge) => edge.id === "network-child-fan-bus:issuer").length, 1);
  assert.ok(layout.edges.find((edge) => edge.id === "layout-parent:issuer-partial")?.source.startsWith("network-child-fan:"));
  assert.equal(position("partial").x, position("grandchild").x);
  assert.equal(layout.edges.filter((edge) => edge.id === "network-child-fan-bus:partial").length, 0);
});

test("unordered top-level owners occupy the visual center without disturbing explicit group order", () => {
  const orderedGroups = [10, 20, 30, 40].map((order) => ({
    key: `group-${order}`,
    label: `分组 ${order}`,
    layoutOrder: order,
  }));
  const centered: VisualizationNetworkSpec = {
    kind: "network",
    focusNodeKey: "issuer",
    groups: orderedGroups,
    nodes: [
      ...orderedGroups.map((group) => ({
        key: `member-${group.layoutOrder}`,
        label: `成员 ${group.layoutOrder}`,
        groupKey: group.key,
      })),
      { key: "unordered", label: "未指定顺序" },
      { key: "issuer", label: "主体", size: "wide" as const },
    ],
    edges: [
      ...orderedGroups.flatMap((group) => [
        { key: `member-edge-${group.layoutOrder}`, source: `member-${group.layoutOrder}`, target: "issuer" },
        { key: `group-edge-${group.layoutOrder}`, source: group.key, target: "issuer" },
      ]),
      { key: "unordered-edge", source: "unordered", target: "issuer" },
    ],
  };
  const layout = buildConvergingNetworkData(centered);
  assert.ok(layout);
  const x = (key: string) => layout.nodes.find((node) => node.id === key)?.style.x ?? Number.NaN;
  assert.ok(x("member-10") < x("member-20"));
  assert.ok(x("member-20") < x("unordered"));
  assert.ok(x("unordered") < x("member-30"));
  assert.ok(x("member-30") < x("member-40"));
});

test("adaptive hierarchy keeps a five-node business row horizontal and turns only dense rows vertical", () => {
  const hierarchy = (childCount: number): VisualizationNetworkSpec => ({
    kind: "network",
    layout: { kind: "hierarchy", nodeAspect: "adaptive" },
    focusNodeKey: "root",
    nodes: [
      { key: "root", label: "董事会", size: "wide", emphasis: "focus" },
      ...Array.from({ length: childCount }, (_, index) => ({
        key: `child-${index}`,
        label: `第${index + 1}事业部门`,
      })),
    ],
    edges: Array.from({ length: childCount }, (_, index) => ({
      key: `edge-${index}`,
      source: "root",
      target: `child-${index}`,
    })),
  });
  const wide = buildConvergingNetworkData(hierarchy(8));
  const narrow = buildConvergingNetworkData(hierarchy(5));
  assert.ok(wide && narrow);
  assert.equal(wide.nodes.find((node) => node.id === "root")?.data.orientation, "horizontal");
  assert.equal(
    wide.nodes.filter((node) => node.id.startsWith("child-") && node.data.orientation === "vertical").length,
    8,
  );
  const verticalSizes = wide.nodes
    .filter((node) => node.id.startsWith("child-"))
    .map((node) => [node.data.width, node.data.height]);
  assert.deepEqual(verticalSizes, Array.from({ length: 8 }, () => [82, 184]));
  assert.equal(
    narrow.nodes.filter((node) => node.id.startsWith("child-") && node.data.orientation === "vertical").length,
    0,
  );
  assert.ok((wide.nodes.find((node) => node.id === "root")?.style.y ?? Infinity) < 100);
});

test("hierarchy rows stay independently centered when one committee has a wide descendant layer", () => {
  const committeeNodes = Array.from({ length: 4 }, (_, index) => ({
    key: `committee-${index}`,
    label: `委员会${index + 1}`,
    size: "compact" as const,
    layoutOrder: index,
  }));
  const base = (withDescendants: boolean): VisualizationNetworkSpec => ({
    kind: "network",
    layout: { kind: "hierarchy", nodeAspect: "adaptive" },
    focusNodeKey: "board",
    nodes: [
      { key: "board", label: "董事会", size: "wide", emphasis: "focus" },
      ...committeeNodes,
      ...(withDescendants
        ? Array.from({ length: 12 }, (_, index) => ({ key: `department-${index}`, label: `第${index + 1}部门` }))
        : []),
    ],
    edges: [
      ...committeeNodes.map((node) => ({ key: `board-${node.key}`, source: "board", target: node.key })),
      ...(withDescendants
        ? Array.from({ length: 12 }, (_, index) => ({
          key: `committee-department-${index}`,
          source: "committee-1",
          target: `department-${index}`,
        }))
        : []),
    ],
  });
  const shallow = buildConvergingNetworkData(base(false));
  const deep = buildConvergingNetworkData(base(true));
  assert.ok(shallow && deep);
  const rowX = (layout: NonNullable<typeof deep>) => {
    const rootX = layout.nodes.find((candidate) => candidate.id === "board")?.style.x ?? 0;
    return committeeNodes.map((node) => (
      (layout.nodes.find((candidate) => candidate.id === node.key)?.style.x ?? 0) - rootX
    ));
  };
  assert.deepEqual(rowX(deep), rowX(shallow));
  assert.equal(
    deep.nodes.filter((node) => node.id.startsWith("committee-") && node.data.orientation === "vertical").length,
    0,
  );
  assert.equal(
    deep.nodes.filter((node) => node.id.startsWith("department-") && node.data.orientation === "vertical").length,
    12,
  );
});

test("a hierarchy child block uses free space directly below its own parent", () => {
  const hierarchy: VisualizationNetworkSpec = {
    kind: "network",
    layout: { kind: "hierarchy", nodeAspect: "adaptive" },
    focusNodeKey: "root",
    nodes: [
      { key: "root", label: "董事会", size: "wide" },
      { key: "left", label: "市场部" },
      { key: "right", label: "其他部门" },
      { key: "child-a", label: "品牌和自媒体" },
      { key: "child-b", label: "医学中心" },
      { key: "right-child", label: "右侧下级" },
      ...Array.from({ length: 8 }, (_, index) => ({
        key: `deep-${index}`,
        label: `深层部门${index + 1}`,
      })),
    ],
    edges: [
      { key: "root-left", source: "root", target: "left" },
      { key: "root-right", source: "root", target: "right" },
      { key: "left-a", source: "left", target: "child-a" },
      { key: "left-b", source: "left", target: "child-b" },
      { key: "right-child", source: "right", target: "right-child" },
      ...Array.from({ length: 8 }, (_, index) => ({
        key: `deep-edge-${index}`,
        source: "right-child",
        target: `deep-${index}`,
      })),
    ],
  };
  const layout = buildConvergingNetworkData(hierarchy);
  assert.ok(layout);
  const x = (key: string) => layout.nodes.find((node) => node.id === key)?.style.x ?? Number.NaN;
  assert.equal((x("child-a") + x("child-b")) / 2, x("left"));
  assert.ok(layout.edges.some((edge) => edge.id === "hierarchy-row:left"));
  assert.ok(!layout.edges.some((edge) => edge.id === "hierarchy-row:right"));
});

test("group boxes include titles, members, ratios and orthogonal member branches", () => {
  const layout = buildConvergingNetworkData(visual);
  assert.ok(layout);
  assert.ok(layout.combos.some((combo) => combo.id === "group-a"));
  const groupedNodes = layout.nodes.filter((node) => node.combo === "group-a");
  assert.ok(groupedNodes.some((node) => node.data.annotationRole === "group-title"));
  assert.equal(groupedNodes.filter((node) => node.data.annotationRole === "ratio").length, 2);

  const positions = new Map(layout.nodes.map((node) => (
    [node.id, [node.style.x, node.style.y] as const] as const
  )));
  for (const edge of layout.edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    assert.ok(source && target, `missing endpoint for ${edge.id}`);
    const points = [source, ...edge.data.controlPoints, target];
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1] as readonly [number, number];
      const current = points[index] as readonly [number, number];
      assert.ok(
        previous[0] === current[0] || previous[1] === current[1],
        `${edge.id} contains a diagonal segment`,
      );
    }
  }
});

test("a one-member group uses one straight vertical connector without a duplicate aggregate ratio", () => {
  const singleton: VisualizationNetworkSpec = {
    kind: "network",
    focusNodeKey: "issuer",
    groups: [{ key: "solo-group", label: "单一股东", outlined: true }],
    nodes: [
      { key: "solo", label: "唯一股东", groupKey: "solo-group", size: "compact" },
      { key: "issuer", label: "主体公司", size: "wide", emphasis: "focus" },
    ],
    edges: [
      { key: "solo-interest", source: "solo", target: "issuer", label: "100.00%", value: 1 },
      { key: "solo-total", source: "solo-group", target: "issuer", label: "100.00%", value: 1 },
    ],
  };
  const layout = buildConvergingNetworkData(singleton);
  assert.ok(layout);
  const solo = layout.nodes.find((node) => node.id === "solo");
  const groupAnchor = layout.nodes.find((node) => node.id === "network-group-anchor:solo-group");
  assert.ok(solo && groupAnchor);
  assert.equal(solo.style.x, groupAnchor.style.x);
  assert.deepEqual(
    layout.edges.find((edge) => edge.id === "layout-member:solo-interest")?.data.controlPoints,
    [],
  );
  assert.equal(
    layout.nodes.filter((node) => node.id === "ratio:group:solo-group").length,
    0,
  );
});
