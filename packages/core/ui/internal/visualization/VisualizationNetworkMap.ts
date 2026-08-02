import type { EdgeData, Element, IPointerEvent, NodeData } from "@antv/g6";

import type {
  VisualizationNetworkEdgeSpec,
  VisualizationNetworkNodeSpec,
  VisualizationNetworkSpec,
} from "../../VisualizationSurfaceTypes";
import { mapCommunityKeys } from "./VisualizationNetworkMapLayout";

export interface MapNetworkNodeDatum {
  kind: "map";
  spec: VisualizationNetworkNodeSpec;
  communityKey: string;
  degree: number;
  diameter: number;
  selfReference: boolean;
  size: number;
}

interface MapNetworkEdgeDatum {
  kind: "relation";
  spec: VisualizationNetworkEdgeSpec;
}

export function buildMapNetworkData(visual: VisualizationNetworkSpec) {
  const degrees = new Map(visual.nodes.map((node) => [node.key, 0]));
  const selfReferenceNodeKeys = new Set<string>();
  const communityKeys = mapCommunityKeys(visual);
  for (const edge of visual.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    if (edge.source === edge.target) {
      selfReferenceNodeKeys.add(edge.source);
    } else {
      degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    }
  }
  return {
    nodes: visual.nodes.map((node) => {
      const degree = degrees.get(node.key) ?? 0;
      const diameter = mapNodeDiameter(degree);
      return {
        id: node.key,
        data: {
          kind: "map" as const,
          spec: node,
          communityKey: communityKeys.get(node.key) ?? `community:${node.key}`,
          degree,
          diameter,
          selfReference: selfReferenceNodeKeys.has(node.key),
          size: diameter,
        },
      };
    }),
    edges: visual.edges.filter((edge) => edge.source !== edge.target).map((edge) => ({
      id: edge.key,
      source: edge.source,
      target: edge.target,
      data: { kind: "relation" as const, spec: edge },
    })),
  };
}

export function createMapNetworkBehaviors() {
  return [
    "drag-canvas",
    "zoom-canvas",
  ];
}

export function isMapNodeKeyTarget(event: IPointerEvent) {
  if (event.targetType !== "node") return false;
  return event.originalTarget === (event.target as Element).getShape("key");
}

export function mapNodeStyle(datum: NodeData) {
  const data = datum.data as unknown as MapNetworkNodeDatum;
  return {
    size: data.diameter,
    fill: "#626262",
    stroke: data.selfReference ? "#8b6a3f" : "#595959",
    lineWidth: data.selfReference ? 1.5 : 0.8,
    label: false,
    haloPointerEvents: "none" as const,
    cursor: "pointer" as const,
    port: false,
    zIndex: 2,
  };
}

export const MAP_NODE_STATES = {
  active: {
    fillOpacity: 1,
    strokeOpacity: 1,
    lineWidth: 2,
    halo: true,
    haloLineWidth: 8,
    haloStrokeOpacity: 0.12,
    zIndex: 8,
  },
  hovered: {
    halo: true,
    haloLineWidth: 9,
    haloStrokeOpacity: 0.16,
    zIndex: 9,
  },
  outgoing: {
    fill: "#c77a32",
    stroke: "#9b5a20",
    haloStroke: "#c77a32",
    zIndex: 8,
  },
  incoming: {
    fill: "#5f82ad",
    stroke: "#46698f",
    haloStroke: "#5f82ad",
    zIndex: 8,
  },
  selected: {
    fillOpacity: 1,
    strokeOpacity: 1,
    lineWidth: 2.5,
    halo: true,
    haloLineWidth: 12,
    haloStrokeOpacity: 0.2,
    zIndex: 10,
  },
  inactive: {
    fillOpacity: 0.09,
    strokeOpacity: 0.08,
    zIndex: 0,
  },
};

export function mapEdgeStyle(datum: EdgeData) {
  const data = datum.data as unknown as MapNetworkEdgeDatum;
  return {
    stroke: "#9ca3ab",
    strokeOpacity: 0.42,
    lineWidth: 0.8,
    lineDash: data.spec.dashed ? [4, 4] : 0,
    labelText: data.spec.label,
    labelFill: "#475569",
    labelFontFamily: "ui-sans-serif, system-ui, sans-serif",
    labelFontSize: 10,
    labelOpacity: 0,
    labelBackground: true,
    labelBackgroundFill: "#ffffff",
    labelBackgroundFillOpacity: 0.94,
    labelBackgroundPadding: [2, 4, 2, 4],
    startArrow: false,
    endArrow: false,
    increasedLineWidthForHitTesting: 5,
    zIndex: 1,
  };
}

export const MAP_EDGE_STATES = {
  active: {
    strokeOpacity: 0.86,
    lineWidth: 1.5,
    labelOpacity: 0,
    startArrow: false,
    endArrow: false,
    zIndex: 7,
  },
  outgoing: {
    stroke: "#c77a32",
    startArrow: false,
    endArrow: false,
  },
  incoming: {
    stroke: "#5f82ad",
    startArrow: false,
    endArrow: false,
  },
  selected: {
    strokeOpacity: 0.92,
    lineWidth: 1.7,
    labelOpacity: 0,
    startArrow: false,
    endArrow: false,
    zIndex: 8,
  },
  inactive: {
    strokeOpacity: 0.025,
    labelOpacity: 0,
    zIndex: 0,
  },
};

export function mapNodeDiameter(degree: number) {
  const rootDegree = Math.sqrt(Math.max(0, degree));
  return 8 + 32 * rootDegree / (rootDegree + 5);
}
