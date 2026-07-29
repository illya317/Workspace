import type { MapCollisionNode } from "./VisualizationNetworkMapCollision";

export interface MapCommunityNode extends MapCollisionNode {
  communityKey: string;
}

interface CommunityBounds {
  key: string;
  centerX: number;
  centerY: number;
  radius: number;
  isolated: boolean;
}

interface PlacedCommunity extends CommunityBounds {
  targetX: number;
  targetY: number;
}

export const MAP_COMMUNITY_GAP = 56;
export const MAP_ISOLATE_GAP = 26;

export function separateMapCommunities(
  nodes: readonly MapCommunityNode[],
  communityGap = MAP_COMMUNITY_GAP,
  isolateGap = MAP_ISOLATE_GAP,
) {
  if (nodes.length <= 1) return nodes.map((node) => ({ ...node }));

  const communities = communityBounds(nodes);
  const relatedCommunities = communities
    .filter((community) => !community.isolated)
    .sort((left, right) => right.radius - left.radius || left.key.localeCompare(right.key));
  const isolatedCommunities = communities
    .filter((community) => community.isolated)
    .sort((left, right) => left.key.localeCompare(right.key));
  const placed = packRelatedCommunities(relatedCommunities, communityGap);
  const relatedExtent = Math.max(0, ...placed.map((community) => (
    Math.hypot(community.targetX, community.targetY) + community.radius
  )));
  const isolated = placeIsolatedCommunities(isolatedCommunities, relatedExtent, isolateGap);
  const placements = new Map([...placed, ...isolated].map((community) => [community.key, community]));
  const sources = new Map(communities.map((community) => [community.key, community]));

  return nodes.map((node) => {
    const source = sources.get(node.communityKey);
    const target = placements.get(node.communityKey);
    if (!source || !target) return { ...node };
    return {
      ...node,
      x: node.x + target.targetX - source.centerX,
      y: node.y + target.targetY - source.centerY,
    };
  });
}

function communityBounds(nodes: readonly MapCommunityNode[]) {
  const grouped = new Map<string, MapCommunityNode[]>();
  for (const node of nodes) {
    const members = grouped.get(node.communityKey) ?? [];
    members.push(node);
    grouped.set(node.communityKey, members);
  }

  return [...grouped.entries()].map(([key, members]): CommunityBounds => {
    const centerX = members.reduce((sum, node) => sum + node.x, 0) / members.length;
    const centerY = members.reduce((sum, node) => sum + node.y, 0) / members.length;
    const radius = Math.max(...members.map((node) => (
      Math.hypot(node.x - centerX, node.y - centerY) + node.diameter / 2
    )));
    return {
      key,
      centerX,
      centerY,
      radius,
      isolated: key.startsWith("isolated:"),
    };
  });
}

function packRelatedCommunities(communities: readonly CommunityBounds[], gap: number) {
  const placed: PlacedCommunity[] = [];
  for (const community of communities) {
    if (placed.length === 0) {
      placed.push({ ...community, targetX: 0, targetY: 0 });
      continue;
    }

    let best: { targetX: number; targetY: number; extent: number } | undefined;
    const angleOffset = placed.length * Math.PI * (3 - Math.sqrt(5));
    for (const anchor of placed) {
      // Keep a tiny deterministic safety margin so circles that are tangent in
      // theory do not overlap after floating-point transforms and rendering.
      const tangentDistance = anchor.radius + community.radius + gap + 0.1;
      for (let step = 0; step < 96; step += 1) {
        const angle = angleOffset + step * 2 * Math.PI / 96;
        const targetX = anchor.targetX + Math.cos(angle) * tangentDistance;
        const targetY = anchor.targetY + Math.sin(angle) * tangentDistance;
        const overlaps = placed.some((other) => (
          Math.hypot(targetX - other.targetX, targetY - other.targetY)
            < community.radius + other.radius + gap - 0.01
        ));
        if (overlaps) continue;
        const extent = Math.hypot(targetX, targetY) + community.radius;
        if (!best || extent < best.extent) best = { targetX, targetY, extent };
      }
    }
    const fallbackX = Math.max(...placed.map((other) => other.targetX + other.radius))
      + community.radius + gap;
    placed.push({
      ...community,
      targetX: best?.targetX ?? fallbackX,
      targetY: best?.targetY ?? 0,
    });
  }
  return placed;
}

function placeIsolatedCommunities(
  communities: readonly CommunityBounds[],
  relatedExtent: number,
  gap: number,
) {
  if (communities.length === 0) return [];
  if (communities.length === 1 && relatedExtent === 0) {
    return [{ ...communities[0], targetX: 0, targetY: 0 }];
  }

  const maxRadius = Math.max(...communities.map((community) => community.radius));
  const spacing = maxRadius * 2 + gap;
  const minimumRadius = relatedExtent > 0
    ? relatedExtent + gap * 2 + maxRadius
    : spacing;
  const capacityRadius = communities.length > 1
    ? spacing / (2 * Math.sin(Math.PI / communities.length))
    : spacing;
  const ringRadius = Math.max(minimumRadius, capacityRadius);

  return communities.map((community, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / communities.length;
    return {
      ...community,
      targetX: Math.cos(angle) * ringRadius,
      targetY: Math.sin(angle) * ringRadius,
    };
  });
}
