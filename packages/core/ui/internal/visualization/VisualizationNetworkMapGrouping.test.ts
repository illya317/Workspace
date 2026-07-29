import assert from "node:assert/strict";
import test from "node:test";

import {
  MAP_COMMUNITY_GAP,
  MAP_ISOLATE_GAP,
  separateMapCommunities,
  type MapCommunityNode,
} from "./VisualizationNetworkMapGrouping";

test("community packing preserves each cluster shape and separates overlapping clusters", () => {
  const nodes: MapCommunityNode[] = [
    { id: "a1", communityKey: "community:a", x: 0, y: 0, diameter: 12 },
    { id: "a2", communityKey: "community:a", x: 20, y: 0, diameter: 12 },
    { id: "b1", communityKey: "community:b", x: 0, y: 0, diameter: 12 },
    { id: "b2", communityKey: "community:b", x: 20, y: 0, diameter: 12 },
  ];

  const resolved = separateMapCommunities(nodes);
  const byId = new Map(resolved.map((node) => [node.id, node]));
  assert.equal((byId.get("a2")?.x ?? 0) - (byId.get("a1")?.x ?? 0), 20);
  assert.equal((byId.get("b2")?.x ?? 0) - (byId.get("b1")?.x ?? 0), 20);

  const center = (prefix: string) => {
    const members = resolved.filter((node) => node.id.startsWith(prefix));
    return {
      x: members.reduce((sum, node) => sum + node.x, 0) / members.length,
      y: members.reduce((sum, node) => sum + node.y, 0) / members.length,
    };
  };
  const centerA = center("a");
  const centerB = center("b");
  assert.ok(Math.hypot(centerA.x - centerB.x, centerA.y - centerB.y) >= 32 + MAP_COMMUNITY_GAP);
});

test("isolated nodes form a compact satellite disk beside related communities", () => {
  const nodes: MapCommunityNode[] = [
    { id: "a1", communityKey: "community:a", x: -20, y: 0, diameter: 10 },
    { id: "a2", communityKey: "community:a", x: 20, y: 0, diameter: 10 },
    { id: "i1", communityKey: "isolated:i1", x: 0, y: 0, diameter: 8 },
    { id: "i2", communityKey: "isolated:i2", x: 0, y: 0, diameter: 8 },
    { id: "i3", communityKey: "isolated:i3", x: 0, y: 0, diameter: 8 },
    { id: "i4", communityKey: "isolated:i4", x: 0, y: 0, diameter: 8 },
    { id: "i5", communityKey: "isolated:i5", x: 0, y: 0, diameter: 8 },
    { id: "i6", communityKey: "isolated:i6", x: 0, y: 0, diameter: 8 },
  ];

  const resolved = separateMapCommunities(nodes);
  const relatedExtent = Math.max(...resolved
    .filter((node) => node.communityKey === "community:a")
    .map((node) => Math.hypot(node.x, node.y) + node.diameter / 2));
  const isolated = resolved.filter((node) => node.communityKey.startsWith("isolated:"));
  assert.ok(isolated.every((node) => node.x - node.diameter / 2 >= relatedExtent + MAP_ISOLATE_GAP));
  const centerX = isolated.reduce((sum, node) => sum + node.x, 0) / isolated.length;
  const centerY = isolated.reduce((sum, node) => sum + node.y, 0) / isolated.length;
  const radii = isolated.map((node) => Math.hypot(node.x - centerX, node.y - centerY));
  assert.ok(new Set(radii.map((radius) => Math.round(radius))).size > 1);
  for (let left = 0; left < isolated.length; left += 1) {
    for (let right = left + 1; right < isolated.length; right += 1) {
      const current = isolated[left];
      const next = isolated[right];
      assert.ok(
        Math.hypot(current.x - next.x, current.y - next.y)
          >= current.diameter / 2 + next.diameter / 2 + MAP_ISOLATE_GAP - 0.001,
      );
    }
  }
});

test("isolated-node layout grows by area instead of one ever-larger perimeter", () => {
  const nodes = Array.from({ length: 100 }, (_, index): MapCommunityNode => ({
    id: `i${index}`,
    communityKey: `isolated:i${index}`,
    x: 0,
    y: 0,
    diameter: 8,
  }));

  const resolved = separateMapCommunities(nodes);
  const centerX = resolved.reduce((sum, node) => sum + node.x, 0) / resolved.length;
  const centerY = resolved.reduce((sum, node) => sum + node.y, 0) / resolved.length;
  const radius = Math.max(...resolved.map((node) => (
    Math.hypot(node.x - centerX, node.y - centerY) + node.diameter / 2
  )));

  assert.ok(radius < 11 * (8 + MAP_ISOLATE_GAP));
});
