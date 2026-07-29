export interface MapCollisionNode {
  id: string;
  x: number;
  y: number;
  diameter: number;
}

export const MAP_NODE_COLLISION_GAP = 12;

export function resolveMapNodeCollisions<Node extends MapCollisionNode>(
  nodes: readonly Node[],
  gap = MAP_NODE_COLLISION_GAP,
  maxIterations = 100,
) {
  const resolved = nodes.map((node) => ({ ...node }));
  const maxDiameter = Math.max(0, ...resolved.map((node) => node.diameter));
  const maxPairDistance = maxDiameter + gap;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let largestOverlap = 0;
    const ordered = [...resolved].sort((left, right) => left.x - right.x || left.id.localeCompare(right.id));

    for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
      const left = ordered[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
        const right = ordered[rightIndex];
        if (right.x - left.x > maxPairDistance) break;

        const minimumDistance = (left.diameter + right.diameter) / 2 + gap;
        const deltaX = right.x - left.x;
        const deltaY = right.y - left.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance >= minimumDistance) continue;

        const overlap = minimumDistance - distance;
        largestOverlap = Math.max(largestOverlap, overlap);
        const [directionX, directionY] = distance > 0.0001
          ? [deltaX / distance, deltaY / distance]
          : deterministicDirection(left.id, right.id);
        const shift = overlap / 2 + 0.01;
        left.x -= directionX * shift;
        left.y -= directionY * shift;
        right.x += directionX * shift;
        right.y += directionY * shift;
      }
    }

    if (largestOverlap < 0.01) break;
  }

  return resolved;
}

function deterministicDirection(leftId: string, rightId: string): [number, number] {
  const input = `${leftId}:${rightId}`;
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  const angle = hash % 360 * Math.PI / 180;
  return [Math.cos(angle), Math.sin(angle)];
}
