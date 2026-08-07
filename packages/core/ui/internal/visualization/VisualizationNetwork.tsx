"use client";

import type { Graph as G6Graph, GraphOptions } from "@antv/g6";
import { useEffect, useRef, useState } from "react";

import type { VisualizationNetworkSpec } from "../../VisualizationSurfaceTypes";
import { ActionGlyph } from "../action/ActionGlyphs";
import { EmptyStateCard } from "../common/Card";
import {
  createDiagramNetworkGraphOptions,
  groupSpec,
  groupStyle,
} from "./VisualizationNetworkDiagram";
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
import {
  VisualizationNetworkMapLabels,
} from "./VisualizationNetworkMapLabels";
import type { MapNetworkLabelSelection } from "./VisualizationNetworkMapInteraction";

type NetworkGraphOptions = GraphOptions;

export default function VisualizationNetwork({ visual }: { visual: VisualizationNetworkSpec }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<G6Graph | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapHost, setMapHost] = useState<{ graph: G6Graph; container: HTMLDivElement } | null>(null);
  const [mapLabelSelection, setMapLabelSelection] = useState<MapNetworkLabelSelection | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || visual.nodes.length === 0) return;
    let active = true;
    let graph: G6Graph | null = null;
    let unbindMapInteractions: (() => void) | undefined;
    setStatus("loading");
    setMapHost(null);
    setMapLabelSelection(null);

    void import("@antv/g6").then(async ({ Graph }) => {
      if (!active) return;
      const mapPresentation = visual.presentation === "map";
      graph = new Graph(mapPresentation
        ? createMapNetworkGraphOptions(visual, container)
        : createDiagramNetworkGraphOptions(visual, container));
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
          {
            onNodeSelect: visual.onNodeSelect,
            onNavigateBack: visual.backNavigation?.onActivate,
            showEdgeDirection: Boolean(visual.edgeDirectionLegend),
            showRelatedLabels: Boolean(visual.focusNodeKey),
            onLabelSelectionChange: setMapLabelSelection,
          },
        );
        setMapHost({ graph, container });
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
      {status === "ready" && visual.presentation === "map" ? (
        <VisualizationNetworkMapLabels
          graph={mapHost?.graph ?? null}
          container={mapHost?.container ?? null}
          selection={mapLabelSelection}
          reserveBackNavigation={Boolean(visual.backNavigation)}
          reserveDirectionLegend={Boolean(visual.edgeDirectionLegend)}
        />
      ) : null}
      {status === "ready" && visual.presentation === "map" && visual.backNavigation ? (
        <button
          type="button"
          className="absolute left-3 top-3 grid size-9 place-items-center rounded-lg border border-slate-200 bg-white/95 text-slate-600 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          aria-label={visual.backNavigation.label}
          title={`${visual.backNavigation.label}（桌面端可右键）`}
          onClick={visual.backNavigation.onActivate}
        >
          <ActionGlyph kind="back" className="size-4" />
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

function createMapNetworkGraphOptions(
  visual: VisualizationNetworkSpec,
  container: HTMLDivElement,
): NetworkGraphOptions {
  const viewport = createMapNetworkViewport();
  return {
    container,
    animation: false,
    autoFit: viewport.autoFit,
    background: "#fbfbfa",
    padding: viewport.padding,
    zoomRange: viewport.zoomRange,
    data: buildMapNetworkData(visual),
    layout: createMapNetworkLayout(visual.nodes.length),
    node: {
      type: "circle",
      style: (datum) => mapNodeStyle(datum),
      state: MAP_NODE_STATES,
    },
    combo: {
      type: "rect",
      style: (datum) => groupStyle(groupSpec(datum), false),
    },
    edge: {
      type: "line",
      style: (datum) => mapEdgeStyle(datum),
      state: MAP_EDGE_STATES,
    },
    behaviors: createMapNetworkBehaviors(),
  };
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
