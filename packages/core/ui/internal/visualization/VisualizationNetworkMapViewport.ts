import type { Graph as G6Graph } from "@antv/g6";

export const MAP_MIN_ZOOM = 0.5;
export const MAP_MAX_ZOOM = 6;

export function createMapNetworkViewport() {
  return {
    autoFit: {
      type: "view" as const,
      options: { when: "always" as const, direction: "both" as const },
      animation: false,
    },
    padding: 32,
    zoomRange: [MAP_MIN_ZOOM, MAP_MAX_ZOOM] as [number, number],
  };
}

export async function fitMapNetworkView(graph: G6Graph) {
  await graph.fitView({ when: "always", direction: "both" }, false);
  if (graph.getZoom() < MAP_MIN_ZOOM) await graph.zoomTo(MAP_MIN_ZOOM, false);
}
