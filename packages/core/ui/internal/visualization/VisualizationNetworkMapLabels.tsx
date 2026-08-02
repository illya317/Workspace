"use client";

import type { Graph as G6Graph } from "@antv/g6";
import { useEffect, useState } from "react";

import type { MapNetworkNodeDatum } from "./VisualizationNetworkMap";
import {
  layoutMapNetworkLabels,
  MAP_PRIMARY_LABEL_FONT_SIZE,
  MAP_RELATED_LABEL_FONT_SIZE,
  type MapLabelTextMeasurer,
  type ScreenRect,
} from "./VisualizationNetworkMapLabelLayout";
import type { MapNetworkLabelSelection } from "./VisualizationNetworkMapInteraction";

interface MapNetworkMapLabelsProps {
  graph: G6Graph | null;
  container: HTMLElement | null;
  selection: MapNetworkLabelSelection | null;
  reserveBackNavigation: boolean;
  reserveDirectionLegend: boolean;
}

export function VisualizationNetworkMapLabels({
  graph,
  container,
  selection,
  reserveBackNavigation,
  reserveDirectionLegend,
}: MapNetworkMapLabelsProps) {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!graph || !container) return undefined;
    let frame = 0;
    const invalidate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRevision((value) => value + 1));
    };
    const resizeObserver = new ResizeObserver(invalidate);
    resizeObserver.observe(container);
    graph.on("aftertransform", invalidate);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      graph.off("aftertransform", invalidate);
    };
  }, [container, graph]);

  const labels = mapLabelLayouts(
    graph,
    container,
    selection,
    reserveBackNavigation,
    reserveDirectionLegend,
    revision,
  );

  if (labels.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {labels.map((label) => (
        <span
          key={label.key}
          className={`absolute grid place-items-center whitespace-pre rounded bg-[#fbfbfa]/95 px-1.5 py-0.5 text-center text-slate-600 ${label.primary ? "font-semibold" : "font-medium"}`}
          style={{
            left: label.left,
            top: label.top,
            width: label.width,
            height: label.height,
            fontSize: label.primary ? MAP_PRIMARY_LABEL_FONT_SIZE : MAP_RELATED_LABEL_FONT_SIZE,
            lineHeight: label.primary ? "18px" : "16px",
          }}
        >
          {label.label}
        </span>
      ))}
    </div>
  );
}

function mapLabelLayouts(
  graph: G6Graph | null,
  container: HTMLElement | null,
  selection: MapNetworkLabelSelection | null,
  reserveBackNavigation: boolean,
  reserveDirectionLegend: boolean,
  _revision: number,
) {
  if (!graph || !container || !selection) return [];
  const width = container.clientWidth;
  const height = container.clientHeight;
  const zoom = graph.getZoom();
  const measureText = mapLabelTextMeasurer(container);
  const nodes = graph.getNodeData().flatMap((node) => {
    const data = node.data as unknown as Partial<MapNetworkNodeDatum> | undefined;
    if (!node.id || data?.kind !== "map" || !data.spec || typeof data.diameter !== "number") return [];
    const [x, y] = graph.getViewportByCanvas(graph.getElementPosition(node.id));
    return [{
      key: node.id,
      label: data.spec.label,
      x,
      y,
      radius: data.diameter * zoom / 2,
      degree: data.degree ?? 0,
    }];
  });
  return layoutMapNetworkLabels({
    nodes,
    selection,
    width,
    height,
    measureText,
    reservedRects: reservedMapAreas(width, height, reserveBackNavigation, reserveDirectionLegend),
  });
}

const mapLabelMeasurers = new WeakMap<HTMLElement, MapLabelTextMeasurer>();

function mapLabelTextMeasurer(container: HTMLElement) {
  const existing = mapLabelMeasurers.get(container);
  if (existing) return existing;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return undefined;
  const fontFamily = getComputedStyle(container).fontFamily || "sans-serif";
  const measure: MapLabelTextMeasurer = (line, primary) => {
    const fontSize = primary ? MAP_PRIMARY_LABEL_FONT_SIZE : MAP_RELATED_LABEL_FONT_SIZE;
    context.font = `${primary ? 600 : 500} ${fontSize}px ${fontFamily}`;
    const metrics = context.measureText(line);
    return Math.max(metrics.width, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight);
  };
  mapLabelMeasurers.set(container, measure);
  return measure;
}

function reservedMapAreas(
  width: number,
  height: number,
  reserveBackNavigation: boolean,
  reserveDirectionLegend: boolean,
) {
  const areas: ScreenRect[] = [{ left: Math.max(0, width - 270), top: Math.max(0, height - 58), right: width, bottom: height }];
  if (reserveBackNavigation) areas.push({ left: 0, top: 0, right: Math.min(58, width), bottom: Math.min(58, height) });
  if (reserveDirectionLegend) areas.push({ left: 0, top: Math.max(0, height - 58), right: Math.min(360, width), bottom: height });
  return areas;
}
