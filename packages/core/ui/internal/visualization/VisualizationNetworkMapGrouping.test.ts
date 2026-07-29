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

test("isolated nodes form one circular outer ring around related communities", () => {
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
  const isolatedRadii = resolved
    .filter((node) => node.communityKey.startsWith("isolated:"))
    .map((node) => Math.hypot(node.x, node.y));
  assert.ok(isolatedRadii.every((radius) => radius > relatedExtent));
  assert.ok(Math.max(...isolatedRadii) - Math.min(...isolatedRadii) < 0.001);
  const isolated = resolved.filter((node) => node.communityKey.startsWith("isolated:"));
  for (let index = 0; index < isolated.length; index += 1) {
    const current = isolated[index];
    const next = isolated[(index + 1) % isolated.length];
    assert.ok(
      Math.hypot(current.x - next.x, current.y - next.y)
        >= current.diameter / 2 + next.diameter / 2 + MAP_ISOLATE_GAP - 0.001,
    );
  }
});
