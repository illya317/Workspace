import { louvain } from "@antv/algorithm";

import type { VisualizationNetworkSpec } from "../../VisualizationSurfaceTypes";
import { resolveMapNodeCollisions } from "./VisualizationNetworkMapCollision";
import {
  separateMapCommunities,
  type MapCommunityNode,
} from "./VisualizationNetworkMapGrouping";

interface MapLayoutNodeDatum {
  communityKey?: string;
  diameter?: number;
}

export function createMapNetworkLayout(nodeCount: number) {
  return {
    type: "d3-force" as const,
    preventOverlap: true,
    nodeSize: (node: { data?: unknown }) => (
      (node.data as MapLayoutNodeDatum | undefined)?.diameter ?? 10
    ),
    nodeSpacing: 22,
    collideStrength: 1,
    collideIterations: 4,
    manyBody: {
      strength: nodeCount > 240 ? -52 : -68,
      distanceMin: 12,
    },
    link: {
      distance: nodeCount > 240 ? 48 : 58,
      strength: 0.3,
      iterations: 2,
    },
    center: { strength: 0.035 },
    clustering: true,
    clusterBy: (node: { data?: unknown }) => (
      (node.data as MapLayoutNodeDatum | undefined)?.communityKey ?? "community:unknown"
    ),
    clusterNodeStrength: nodeCount > 240 ? -72 : -88,
    clusterEdgeStrength: 0.025,
    clusterEdgeDistance: 180,
    clusterNodeSize: nodeCount > 240 ? 28 : 34,
    clusterFociStrength: 0.72,
    alphaDecay: nodeCount > 240 ? 0.035 : 0.03,
    velocityDecay: 0.46,
  };
}

export function arrangeMapNetworkNodes(nodes: readonly MapCommunityNode[]) {
  return separateMapCommunities(resolveMapNodeCollisions(nodes));
}

export function mapCommunityKeys(visual: VisualizationNetworkSpec) {
  const nodeKeys = new Set(visual.nodes.map((node) => node.key));
  const edges = visual.edges
    .filter((edge) => edge.source !== edge.target && nodeKeys.has(edge.source) && nodeKeys.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target, weight: 1 }));
  const connectedNodeKeys = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const connectedNodes = visual.nodes
    .filter((node) => connectedNodeKeys.has(node.key))
    .map((node) => ({ id: node.key }));
  const communityKeys = new Map(visual.nodes.map((node) => [node.key, `isolated:${node.key}`]));
  if (connectedNodes.length === 0) return communityKeys;

  const discovered = louvain({ nodes: connectedNodes, edges }, false, "weight", 0.0001).clusters;
  const targetCommunityCount = Math.min(10, Math.max(2, Math.round(Math.sqrt(connectedNodes.length) / 2)));
  const clusters = mergeSmallCommunities(discovered.map((cluster) => (
    cluster.nodes.map((node) => node.id)
  )), edges, targetCommunityCount);
  for (const cluster of clusters) {
    const memberKeys = [...cluster].sort((left, right) => left.localeCompare(right));
    const communityKey = `community:${memberKeys[0]}`;
    for (const memberKey of memberKeys) communityKeys.set(memberKey, communityKey);
  }
  return communityKeys;
}

function mergeSmallCommunities(
  clusters: readonly string[][],
  edges: readonly { source: string; target: string }[],
  targetCount: number,
) {
  const members = new Map(clusters.map((cluster, index) => [String(index), new Set(cluster)]));
  const assignment = new Map<string, string>();
  for (const [clusterKey, nodeKeys] of members) {
    for (const nodeKey of nodeKeys) assignment.set(nodeKey, clusterKey);
  }

  while (members.size > targetCount) {
    const neighborWeights = new Map<string, Map<string, number>>();
    for (const edge of edges) {
      const sourceCluster = assignment.get(edge.source);
      const targetCluster = assignment.get(edge.target);
      if (!sourceCluster || !targetCluster || sourceCluster === targetCluster) continue;
      incrementNeighborWeight(neighborWeights, sourceCluster, targetCluster);
      incrementNeighborWeight(neighborWeights, targetCluster, sourceCluster);
    }
    const sourceCluster = [...members.keys()]
      .filter((clusterKey) => (neighborWeights.get(clusterKey)?.size ?? 0) > 0)
      .sort((left, right) => (
        (members.get(left)?.size ?? 0) - (members.get(right)?.size ?? 0)
        || left.localeCompare(right)
      ))[0];
    if (!sourceCluster) break;

    const targetCluster = [...(neighborWeights.get(sourceCluster)?.entries() ?? [])]
      .sort(([leftKey, leftWeight], [rightKey, rightWeight]) => (
        rightWeight - leftWeight
        || (members.get(rightKey)?.size ?? 0) - (members.get(leftKey)?.size ?? 0)
        || leftKey.localeCompare(rightKey)
      ))[0]?.[0];
    if (!targetCluster) break;

    const sourceMembers = members.get(sourceCluster);
    const targetMembers = members.get(targetCluster);
    if (!sourceMembers || !targetMembers) break;
    for (const nodeKey of sourceMembers) {
      targetMembers.add(nodeKey);
      assignment.set(nodeKey, targetCluster);
    }
    members.delete(sourceCluster);
  }

  return [...members.values()].map((cluster) => [...cluster]);
}

function incrementNeighborWeight(
  weights: Map<string, Map<string, number>>,
  sourceKey: string,
  targetKey: string,
) {
  const neighbors = weights.get(sourceKey) ?? new Map<string, number>();
  neighbors.set(targetKey, (neighbors.get(targetKey) ?? 0) + 1);
  weights.set(sourceKey, neighbors);
}
