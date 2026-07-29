"use client";

import type { ComboData, EdgeData, Graph as G6Graph, NodeData } from "@antv/g6";
import { useEffect, useRef, useState } from "react";

import type {
  VisualizationNetworkGroupSpec,
  VisualizationNetworkSpec,
  VisualizationTone,
} from "../../VisualizationSurfaceTypes";
import { ActionGlyph } from "../action/ActionGlyphs";
import { EmptyStateCard } from "../common/Card";
import {
  buildConvergingNetworkData,
  networkNodeSize,
  type PositionedNetworkEdgeData,
  type PositionedNetworkNodeData,
} from "./VisualizationNetworkLayout";
import {
  buildMapNetworkData,
  createMapNetworkBehaviors,
  MAP_EDGE_STATES,
  MAP_NODE_STATES,
  mapEdgeStyle,
  mapNodeStyle,
  type MapNetworkNodeDatum,
} from "./VisualizationNetworkMap";
import { bindMapNetworkInteractions } from "./VisualizationNetworkMapInteraction";
import {
  arrangeMapNetworkNodes,
  createMapNetworkLayout,
} from "./VisualizationNetworkMapLayout";
import {
  createMapNetworkViewport,
  fitMapNetworkView,
} from "./VisualizationNetworkMapViewport";

type NetworkDatum = PositionedNetworkNodeData;

type GroupDatum = {
  spec: VisualizationNetworkGroupSpec;
};

export default function VisualizationNetwork({ visual }: { visual: VisualizationNetworkSpec }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<G6Graph | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || visual.nodes.length === 0) return;
    let active = true;
    let graph: G6Graph | null = null;
    let unbindMapInteractions: (() => void) | undefined;
    setStatus("loading");

    void import("@antv/g6").then(async ({ Graph }) => {
      if (!active) return;
      const mapPresentation = visual.presentation === "map";
      const positioned = mapPresentation ? null : buildConvergingNetworkData(visual);
      const mapViewport = mapPresentation ? createMapNetworkViewport() : null;
      graph = new Graph({
        container,
        animation: false,
        autoFit: mapViewport?.autoFit ?? "view",
        background: mapPresentation ? "#fbfbfa" : "#ffffff",
        padding: mapViewport?.padding ?? 24,
        zoomRange: mapViewport?.zoomRange ?? [0.16, 1.6],
        data: mapPresentation ? buildMapNetworkData(visual) : positioned ?? automaticNetworkData(visual),
        ...(mapPresentation ? { layout: createMapNetworkLayout(visual.nodes.length) } : positioned ? {} : {
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
          type: mapPresentation ? "circle" : "rect",
          style: (datum) => mapPresentation ? mapNodeStyle(datum) : nodeStyle(datum),
          ...(mapPresentation ? { state: MAP_NODE_STATES } : {}),
        },
        combo: {
          type: "rect",
          style: (datum) => groupStyle(groupSpec(datum), Boolean(positioned)),
        },
        edge: {
          type: mapPresentation ? "line" : "polyline",
          style: (datum) => mapPresentation ? mapEdgeStyle(datum) : diagramEdgeStyle(datum, Boolean(positioned)),
          ...(mapPresentation ? { state: MAP_EDGE_STATES } : {}),
        },
        behaviors: mapPresentation
          ? createMapNetworkBehaviors()
          : ["drag-canvas", "zoom-canvas"],
      });
      graphRef.current = graph;
      await graph.render();
      if (!active) return;
      if (mapPresentation) await settleMapNetworkCollisions(graph, true);
      if (mapPresentation && visual.focusNodeKey && graph.hasNode(visual.focusNodeKey)) {
        await graph.setElementState(visual.focusNodeKey, "selected", false);
      }
      if (mapPresentation) {
        unbindMapInteractions = bindMapNetworkInteractions(
          graph,
          container,
          visual.onNodeSelect,
          visual.backNavigation?.onActivate,
          Boolean(visual.edgeDirectionLegend),
        );
      }
      if (active) setStatus("ready");
    }).catch((error: unknown) => {
      console.error("VisualizationNetwork render failed", error);
      if (active) setStatus("error");
    });

    return () => {
      active = false;
      unbindMapInteractions?.();
      if (graphRef.current === graph) graphRef.current = null;
      graph?.destroy();
    };
  }, [visual]);

  if (visual.nodes.length === 0) {
    return <EmptyStateCard compact>{visual.emptyText ?? "暂无关系数据"}</EmptyStateCard>;
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white" style={{ height: visual.height ?? 760 }}>
      <div ref={containerRef} className="size-full" aria-label="关系结构图" />
      {status === "ready" && visual.presentation === "map" && visual.backNavigation ? (
        <button
          type="button"
          className="absolute left-3 top-3 flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 text-xs font-medium text-slate-600 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          title={`${visual.backNavigation.label}（桌面端可右键）`}
          onClick={visual.backNavigation.onActivate}
        >
          <ActionGlyph kind="back" className="size-4" />
          <span>{visual.backNavigation.label}</span>
          <span className="hidden border-l border-slate-200 pl-2 text-[10px] font-normal text-slate-400 lg:inline">右键</span>
        </button>
      ) : null}
      {status === "ready" && visual.presentation === "map" && visual.edgeDirectionLegend ? (
        <div className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-4 rounded-lg border border-slate-200 bg-white/92 px-3 py-2 text-[11px] text-slate-500 shadow-sm backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-[#c77a32]" />
            {visual.edgeDirectionLegend.outgoingLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-[#5f82ad]" />
            {visual.edgeDirectionLegend.incomingLabel}
          </span>
          {visual.edgeDirectionLegend.selfReferenceLabel ? (
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border-2 border-[#c77a32] bg-white" />
              {visual.edgeDirectionLegend.selfReferenceLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/80 text-sm text-slate-500">
          正在计算关系图布局
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 grid place-items-center bg-white p-6">
          <EmptyStateCard compact>关系图布局失败，请刷新后重试</EmptyStateCard>
        </div>
      ) : null}
      {status === "ready" ? (
        <div className="absolute bottom-3 right-4 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm">
          <span className="pointer-events-none px-1.5 text-[11px] text-slate-400">拖动画布</span>
          <button type="button" className="grid size-7 place-items-center rounded text-sm text-slate-600 hover:bg-slate-100" title="缩小" aria-label="缩小关系图" onClick={() => { void graphRef.current?.zoomBy(0.82); }}>−</button>
          <button type="button" className="grid size-7 place-items-center rounded text-sm text-slate-600 hover:bg-slate-100" title="放大" aria-label="放大关系图" onClick={() => { void graphRef.current?.zoomBy(1.22); }}>＋</button>
          <button type="button" className="h-7 rounded px-2 text-[11px] text-slate-600 hover:bg-slate-100" onClick={() => { if (graphRef.current) void fitMapNetworkView(graphRef.current); }}>适应画布</button>
        </div>
      ) : null}
    </div>
  );
}

async function settleMapNetworkCollisions(graph: G6Graph, fitView: boolean) {
  const positionedNodes = graph.getNodeData().flatMap((node) => {
    const x = node.style?.x;
    const y = node.style?.y;
    const diameter = (node.data as unknown as Partial<MapNetworkNodeDatum> | undefined)?.diameter;
    const communityKey = (node.data as unknown as Partial<MapNetworkNodeDatum> | undefined)?.communityKey;
    return typeof x === "number" && typeof y === "number" && typeof diameter === "number" && communityKey
      ? [{ id: node.id, x, y, diameter, communityKey }]
      : [];
  });
  const resolvedNodes = arrangeMapNetworkNodes(positionedNodes);
  const changedNodes = resolvedNodes.filter((node, index) => {
    const original = positionedNodes[index];
    return Math.abs(node.x - original.x) > 0.001 || Math.abs(node.y - original.y) > 0.001;
  });

  if (changedNodes.length > 0) {
    graph.updateNodeData(changedNodes.map((node) => ({
      id: node.id,
      style: { x: node.x, y: node.y },
    })));
    await graph.draw();
  }
  if (fitView) await fitMapNetworkView(graph);
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

function groupSpec(datum: ComboData) {
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

function groupStyle(spec?: VisualizationNetworkGroupSpec, embeddedTitle = false) {
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
