import type { ComboData, EdgeData, GraphOptions, NodeData } from "@antv/g6";

import type {
  VisualizationNetworkGroupSpec,
  VisualizationNetworkSpec,
  VisualizationTone,
} from "../../VisualizationSurfaceTypes";
import {
  buildConvergingNetworkData,
  networkNodeSize,
  type PositionedNetworkEdgeData,
  type PositionedNetworkNodeData,
} from "./VisualizationNetworkLayout";

type NetworkDatum = PositionedNetworkNodeData;

type GroupDatum = {
  spec: VisualizationNetworkGroupSpec;
};

type NetworkGraphOptions = GraphOptions;

export function createDiagramNetworkGraphOptions(
  visual: VisualizationNetworkSpec,
  container: HTMLDivElement,
): NetworkGraphOptions {
  const positioned = buildConvergingNetworkData(visual);
  return {
    container,
    animation: false,
    autoFit: "view",
    background: "#ffffff",
    padding: 24,
    zoomRange: [0.16, 1.6],
    data: positioned ?? automaticNetworkData(visual),
    ...(positioned ? {} : {
      layout: {
        type: "antv-dagre",
        rankdir: "TB",
        ranker: "tight-tree",
        nodesep: 24,
        ranksep: 96,
        controlPoints: true,
        sortByCombo: true,
        edgeLabelSpace: true,
        nodeOrder: networkNodeOrder(visual),
      },
    }),
    node: {
      type: "rect",
      style: (datum: NodeData) => nodeStyle(datum),
    },
    combo: {
      type: "rect",
      style: (datum: ComboData) => groupStyle(groupSpec(datum), Boolean(positioned)),
    },
    edge: {
      type: "polyline",
      style: (datum: EdgeData) => diagramEdgeStyle(datum, Boolean(positioned)),
    },
    behaviors: ["drag-canvas", "zoom-canvas"],
  };
}

function automaticNetworkData(visual: VisualizationNetworkSpec) {
  const groups = visual.groups ?? [];
  const groupKeys = new Set(groups.map((group) => group.key));
  const endpoint = (key: string) => groupKeys.has(key) ? groupAnchorKey(key) : key;
  return {
    nodes: [
      ...visual.nodes.map((node) => ({
        id: node.key,
        combo: node.groupKey ?? null,
        data: { kind: "entity", spec: node, ...networkNodeSize(node) },
      })),
      ...groups.map((group) => ({
        id: groupAnchorKey(group.key),
        combo: group.key,
        data: { kind: "anchor", width: 2, height: 2 },
      })),
    ],
    combos: groups.map((group) => ({
      id: group.key,
      data: { spec: group },
    })),
    edges: visual.edges.map((edge) => ({
      id: edge.key,
      source: endpoint(edge.source),
      target: endpoint(edge.target),
      data: { kind: "relation", spec: edge, controlPoints: [] },
    })),
  };
}

function networkNodeOrder(visual: VisualizationNetworkSpec) {
  const nodes = [...visual.nodes].map((node) => ({ key: node.key, order: node.layoutOrder }));
  const groupAnchors = (visual.groups ?? []).map((group) => ({
    key: groupAnchorKey(group.key),
    order: group.layoutOrder,
  }));
  return [...nodes, ...groupAnchors]
    .sort((left, right) => (
      (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
      || left.key.localeCompare(right.key)
    ))
    .map((node) => node.key);
}

function groupAnchorKey(groupKey: string) {
  return `network-group-anchor:${groupKey}`;
}

export function groupSpec(datum: ComboData) {
  return (datum.data as GroupDatum | undefined)?.spec;
}

function nodeStyle(datum: NodeData) {
  const data = datum.data as NetworkDatum | undefined;
  if (data?.kind === "anchor") {
    return {
      size: [2, 2] as [number, number],
      fillOpacity: 0,
      strokeOpacity: 0,
      label: false,
      port: false,
    };
  }
  if (data?.kind === "annotation") {
    return {
      size: [data.width, data.height] as [number, number],
      fillOpacity: 0,
      strokeOpacity: 0,
      labelText: data.text,
      labelPlacement: "center" as const,
      labelFill: data.annotationRole === "group-title" ? "#172554" : edgeToneColor(data.tone),
      labelFontFamily: "ui-serif, 'Songti SC', 'Noto Serif CJK SC', serif",
      labelFontSize: data.annotationRole === "group-title" ? 14 : 12,
      labelFontWeight: data.annotationRole === "group-title" ? 650 : 520,
      labelWordWrap: false,
      port: false,
    };
  }
  const spec = data?.spec;
  const emphasis = spec?.emphasis ?? "primary";
  const width = data?.width ?? networkNodeSize(spec).width;
  const height = data?.height ?? networkNodeSize(spec).height;
  const tone = nodeTone(spec?.tone);
  const vertical = data?.orientation === "vertical";
  return {
    size: [width, height] as [number, number],
    radius: emphasis === "focus" ? 12 : 10,
    fill: tone.fill,
    stroke: tone.stroke,
    lineWidth: emphasis === "focus" ? 2.2 : 1.5,
    lineDash: emphasis === "context" ? [6, 4] : 0,
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetY: 0,
    labelText: spec?.subtitle
      ? `${spec.label}\n${spec.subtitle}`
      : vertical
        ? [...(spec?.label ?? "")].join("\n")
        : spec?.label,
    labelPlacement: "center" as const,
    labelFill: tone.text,
    labelFontFamily: "ui-serif, 'Songti SC', 'Noto Serif CJK SC', serif",
    labelFontSize: emphasis === "focus" ? 15 : 13,
    labelFontWeight: emphasis === "focus" ? 650 : 560,
    labelLineHeight: vertical ? 15 : emphasis === "focus" ? 21 : 19,
    labelTextAlign: "center" as const,
    labelWordWrap: Boolean(spec?.subtitle),
    labelMaxWidth: width - 24,
    labelMaxLines: vertical ? 11 : spec?.subtitle ? 5 : 1,
    port: false,
  };
}

function diagramEdgeStyle(datum: EdgeData, positioned: boolean) {
  const data = datum.data as PositionedNetworkEdgeData | undefined;
  const spec = data?.spec;
  const color = edgeToneColor(spec?.tone);
  return {
    stroke: color,
    lineWidth: spec?.dashed ? 1.35 : 1.45,
    lineDash: spec?.dashed ? [7, 5] : 0,
    radius: 0,
    controlPoints: data?.controlPoints,
    labelText: positioned ? undefined : spec?.label,
    labelFill: "#334155",
    labelFontFamily: "ui-sans-serif, system-ui, sans-serif",
    labelFontSize: 12,
    labelFontWeight: 600,
    labelBackground: true,
    labelBackgroundFill: "#ffffff",
    labelBackgroundFillOpacity: 0.94,
    labelBackgroundRadius: 4,
    labelBackgroundPadding: [3, 5, 3, 5],
    endArrow: data?.kind === "drop",
    endArrowFill: color,
    endArrowStroke: color,
    endArrowSize: 7,
  };
}

export function groupStyle(spec?: VisualizationNetworkGroupSpec, embeddedTitle = false) {
  const outlined = spec?.outlined !== false;
  const tone = nodeTone(spec?.tone);
  return {
    padding: [13, 13, 13, 13],
    radius: 3,
    fill: "#ffffff",
    fillOpacity: outlined ? 0.98 : 0,
    stroke: tone.stroke,
    strokeOpacity: outlined ? 0.92 : 0,
    lineWidth: outlined ? 1.2 : 0,
    lineDash: [4, 7],
    labelText: embeddedTitle ? undefined : spec?.subtitle ? `${spec.label} · ${spec.subtitle}` : spec?.label,
    labelPlacement: "top" as const,
    labelOffsetY: -14,
    labelFill: "#1e293b",
    labelFontFamily: "ui-sans-serif, system-ui, sans-serif",
    labelFontSize: 14,
    labelFontWeight: 650,
    collapsedMarker: false,
  };
}

function nodeTone(tone: VisualizationTone = "slate") {
  return {
    blue: { fill: "#eff6ff", stroke: "#315b9f", text: "#193b70" },
    emerald: { fill: "#f1f8f5", stroke: "#4f7b69", text: "#234c3d" },
    amber: { fill: "#fffbeb", stroke: "#a36b16", text: "#744810" },
    rose: { fill: "#fff1f2", stroke: "#a84b5a", text: "#7c2d3b" },
    slate: { fill: "#ffffff", stroke: "#526581", text: "#1e293b" },
  }[tone];
}

function edgeToneColor(tone: VisualizationTone = "slate") {
  return {
    blue: "#315b9f",
    emerald: "#4f7b69",
    amber: "#a36b16",
    rose: "#a84b5a",
    slate: "#64748b",
  }[tone];
}
