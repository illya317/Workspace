import assert from "node:assert/strict";
import test from "node:test";

import {
  MAP_NODE_COLLISION_GAP,
  resolveMapNodeCollisions,
  type MapCollisionNode,
} from "./VisualizationNetworkMapCollision";

function overlappingPairs(nodes: readonly MapCollisionNode[]) {
  let count = 0;
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const left = nodes[leftIndex];
      const right = nodes[rightIndex];
      const minimumDistance = (left.diameter + right.diameter) / 2 + MAP_NODE_COLLISION_GAP;
      if (Math.hypot(right.x - left.x, right.y - left.y) + 0.01 < minimumDistance) count += 1;
    }
  }
  return count;
}

test("collision resolver separates a dense stack using each circle's real diameter", () => {
  const nodes = Array.from({ length: 24 }, (_, index) => ({
    id: `node-${index}`,
    x: 0,
    y: 0,
    diameter: 10 + index % 5 * 6,
  }));

  const resolved = resolveMapNodeCollisions(nodes);

  assert.equal(overlappingPairs(resolved), 0);
  assert.ok(resolved.some((node) => node.x !== 0 || node.y !== 0));
});

test("collision resolver leaves an already separated layout unchanged", () => {
  const nodes = [
    { id: "left", x: 0, y: 0, diameter: 20 },
    { id: "right", x: 40, y: 0, diameter: 20 },
  ];

  assert.deepEqual(resolveMapNodeCollisions(nodes), nodes);
});
