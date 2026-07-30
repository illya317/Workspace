"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type Viewer from "bpmn-js/lib/Viewer";

export type WorkflowBpmnCanvasSize = {
  height: number;
  width: number;
};

export type BpmnCanvas = {
  addMarker: (element: string, marker: string) => void;
  removeMarker: (element: string, marker: string) => void;
  resized?: () => void;
};

export type BpmnElementRegistry = {
  getAll: () => Array<{ id: string; type?: string }>;
  get: (id: string) => { id: string; type?: string } | undefined;
};

export type BpmnEventBus = {
  on: (event: string, callback: (event: { element?: { id?: string; type?: string } }) => void) => void;
  off: (event: string, callback: (event: { element?: { id?: string; type?: string } }) => void) => void;
};

type BpmnZoomScroll = {
  toggle: (enabled?: boolean) => boolean;
};

const BPMN_VIEWPORT_HEIGHT = 760;

export function useWorkflowBpmnCanvasLayout(canvasSize: WorkflowBpmnCanvasSize) {
  const scrollFrameRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const scale = Math.min(1, Math.max(1, viewportWidth || canvasSize.width) / Math.max(1, canvasSize.width));
  const scaledHeight = Math.ceil(canvasSize.height * scale);

  useEffect(() => {
    const frame = scrollFrameRef.current;
    if (!frame) return;
    const updateWidth = () => setViewportWidth(frame.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(frame);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  return {
    canvasStageStyle: { height: scaledHeight, width: "100%" } satisfies CSSProperties,
    canvasStyle: {
      height: canvasSize.height,
      left: "50%",
      position: "absolute",
      top: 0,
      transform: `translateX(-50%) scale(${scale})`,
      transformOrigin: "top center",
      width: canvasSize.width,
    } satisfies CSSProperties,
    containerRef,
    scrollFrameRef,
    viewportStyle: { height: Math.min(BPMN_VIEWPORT_HEIGHT, scaledHeight) } satisfies CSSProperties,
  };
}

export function disableBpmnViewerWheel(viewer: Viewer) {
  viewer.get<BpmnZoomScroll | null>("zoomScroll", false)?.toggle(false);
}

export function decorateBpmnViewerSoon(viewer: Viewer, container: HTMLDivElement | null) {
  viewer.get<BpmnCanvas>("canvas").resized?.();
  decorateBpmnCanvas(container);
  window.requestAnimationFrame(() => decorateBpmnCanvas(container));
  window.setTimeout(() => decorateBpmnCanvas(container), 80);
}

/** @ui-specialized-surface BPMN viewer canvas owns third-party viewport, SVG decoration, and interaction layout. */
export function WorkflowBpmnCanvasFrame({
  canvasStageStyle,
  canvasStyle,
  containerRef,
  error,
  header,
  scrollFrameRef,
  viewportStyle,
}: {
  canvasStageStyle: CSSProperties;
  canvasStyle: CSSProperties;
  containerRef: RefObject<HTMLDivElement | null>;
  error: string | null;
  header?: ReactNode;
  scrollFrameRef: RefObject<HTMLDivElement | null>;
  viewportStyle: CSSProperties;
}) {
  return (
    <div className="relative overflow-hidden rounded-md border border-slate-200 bg-white">
      <WorkflowBpmnCanvasStyles />
      <div className={`grid min-w-0 bg-slate-50 ${header ? "grid-rows-[3rem_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)]"}`}>
        {header ? (
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3">
            {header}
          </div>
        ) : null}
        <div ref={scrollFrameRef} className="min-w-0 overflow-y-auto overflow-x-hidden" style={viewportStyle}>
          <div className="relative mx-auto" style={canvasStageStyle}>
            <div ref={containerRef} className="workflow-bpmn-canvas" style={canvasStyle} />
          </div>
        </div>
        {error ? <div className="px-3 pb-3 text-sm text-red-600">{error}</div> : null}
      </div>
    </div>
  );
}

function decorateBpmnCanvas(container: HTMLDivElement | null) {
  hideProcessRootArtifacts(container);
  ensureGatewayMarkers(container);
  ensureTextAnnotationCards(container);
}

function hideProcessRootArtifacts(container: HTMLDivElement | null) {
  if (!container) return;
  const processShape = container.querySelector<SVGGElement>('.djs-element[data-element-id="Workflow"]');
  processShape?.querySelector(":scope > .djs-visual")?.setAttribute("display", "none");
  processShape?.querySelector(":scope > .djs-outline")?.setAttribute("display", "none");
  processShape?.querySelector(":scope > .djs-hit")?.setAttribute("display", "none");
  for (const label of container.querySelectorAll<SVGGElement>(".djs-label")) {
    if (label.textContent?.trim() === "Workflow") label.setAttribute("display", "none");
  }
  for (const text of container.querySelectorAll<SVGTextElement>("svg text")) {
    if (text.textContent?.trim() === "Workflow") (text.closest("g") ?? text).setAttribute("display", "none");
  }
}

function ensureGatewayMarkers(container: HTMLDivElement | null) {
  if (!container) return;
  for (const visual of container.querySelectorAll<SVGGElement>('.djs-element[data-element-id^="ExclusiveGateway_"] .djs-visual')) {
    appendGatewayMarker(visual, "exclusive");
  }
  for (const visual of container.querySelectorAll<SVGGElement>('.djs-element[data-element-id^="ParallelGateway_"] .djs-visual')) {
    appendGatewayMarker(visual, "parallel");
  }
  for (const visual of container.querySelectorAll<SVGGElement>('.djs-element[data-element-id^="InclusiveGateway_"] .djs-visual')) {
    appendGatewayMarker(visual, "inclusive");
  }
}

function appendGatewayMarker(visual: SVGGElement, kind: "exclusive" | "parallel" | "inclusive") {
  for (const marker of visual.querySelectorAll(".workflow-gateway-marker")) marker.remove();
  const marker = document.createElementNS("http://www.w3.org/2000/svg", kind === "inclusive" ? "circle" : "path");
  marker.setAttribute("class", "workflow-gateway-marker");
  if (kind === "inclusive") {
    marker.setAttribute("cx", "25");
    marker.setAttribute("cy", "25");
    marker.setAttribute("r", "8.5");
  } else {
    marker.setAttribute("d", kind === "exclusive" ? "M19 19 L31 31 M31 19 L19 31" : "M25 16.5 V33.5 M16.5 25 H33.5");
  }
  marker.setAttribute("pointer-events", "none");
  visual.appendChild(marker);
}

function ensureTextAnnotationCards(container: HTMLDivElement | null) {
  if (!container) return;
  for (const visual of container.querySelectorAll<SVGGElement>('.djs-element[data-element-id^="TextAnnotation_Branch_"] .djs-visual')) {
    const element = visual.closest<SVGGElement>(".djs-element");
    const group = element?.closest<SVGGElement>(".djs-group") ?? element;
    for (const rect of visual.querySelectorAll(".workflow-text-annotation-card")) rect.remove();
    const card = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    card.setAttribute("class", "workflow-text-annotation-card");
    card.setAttribute("x", "0");
    card.setAttribute("y", "0");
    card.setAttribute("width", "160");
    card.setAttribute("height", "34");
    card.setAttribute("rx", "0");
    card.setAttribute("pointer-events", "none");
    visual.insertBefore(card, visual.firstChild);
    for (const text of visual.querySelectorAll<SVGTextElement>("text")) {
      text.setAttribute("x", "80");
      text.setAttribute("y", "17");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("text-anchor", "middle");
      for (const tspan of text.querySelectorAll<SVGTSpanElement>("tspan")) {
        tspan.setAttribute("x", "80");
      }
    }
    if (group?.parentNode) group.parentNode.appendChild(group);
  }
}

function WorkflowBpmnCanvasStyles() {
  return (
    <style>{`
      .workflow-bpmn-canvas .djs-palette,
      .workflow-bpmn-canvas .djs-context-pad,
      .workflow-bpmn-canvas .bjs-powered-by { display: none; }
      .workflow-bpmn-canvas .djs-element[data-element-id="Workflow"] > .djs-hit,
      .workflow-bpmn-canvas .djs-element[data-element-id="Workflow"] > .djs-outline,
      .workflow-bpmn-canvas .djs-element[data-element-id="Workflow"] > .djs-visual,
      .workflow-bpmn-canvas .djs-label[data-element-id="Workflow"],
      .workflow-bpmn-canvas .djs-label[data-element-id="Workflow_label"] { display: none; }
      .workflow-bpmn-canvas:focus,
      .workflow-bpmn-canvas .djs-container:focus { outline: none; }
      .workflow-bpmn-canvas .djs-hit,
      .workflow-bpmn-canvas .djs-hit-all,
      .workflow-bpmn-canvas .djs-outline,
      .workflow-bpmn-canvas .djs-bendpoint,
      .workflow-bpmn-canvas .djs-segment-dragger,
      .workflow-bpmn-canvas .djs-dragger {
        fill: transparent !important;
        stroke: transparent !important;
        opacity: 0 !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id="StartEvent_1"] .djs-visual > circle {
        fill: #86efac !important;
        stroke: #475569 !important;
        stroke-width: 2px !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id="StartEvent_1"],
      .workflow-bpmn-canvas .djs-element[data-element-id="StartEvent_1"] .djs-hit,
      .workflow-bpmn-canvas .djs-element[data-element-id="StartEvent_1"] .djs-hit-all,
      .workflow-bpmn-canvas .djs-element[data-element-id="StartEvent_1"] .djs-visual {
        cursor: pointer !important;
        pointer-events: all !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id^="Approval_"],
      .workflow-bpmn-canvas .djs-element[data-element-id^="Branch_"],
      .workflow-bpmn-canvas .djs-element[data-element-id^="ExclusiveGateway_"],
      .workflow-bpmn-canvas .djs-element[data-element-id^="ParallelGateway_"],
      .workflow-bpmn-canvas .djs-element[data-element-id^="InclusiveGateway_"] {
        cursor: pointer !important;
        pointer-events: all !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id^="EndEvent_"] .djs-visual > circle:first-child {
        fill: #fca5a5 !important;
        stroke: #1f2937 !important;
        stroke-width: 2.5px !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id^="EndEvent_"] .djs-visual > circle:not(:first-child) {
        fill: #7f1d1d !important;
        stroke: #7f1d1d !important;
      }
      .workflow-bpmn-canvas .djs-label[data-element-id="StartEvent_1_label"] text,
      .workflow-bpmn-canvas .djs-label[data-element-id="StartEvent_1"] text {
        fill: #111827 !important;
        font-weight: 600 !important;
      }
      .workflow-bpmn-canvas .djs-label[data-element-id^="EndEvent_"] text {
        fill: #ffffff !important;
        font-weight: 600 !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id^="ExclusiveGateway_"] .djs-visual > polygon,
      .workflow-bpmn-canvas .djs-element[data-element-id^="ExclusiveGateway_"] .djs-visual > path:first-child,
      .workflow-bpmn-canvas .djs-element[data-element-id^="ParallelGateway_"] .djs-visual > polygon,
      .workflow-bpmn-canvas .djs-element[data-element-id^="ParallelGateway_"] .djs-visual > path:first-child,
      .workflow-bpmn-canvas .djs-element[data-element-id^="InclusiveGateway_"] .djs-visual > polygon,
      .workflow-bpmn-canvas .djs-element[data-element-id^="InclusiveGateway_"] .djs-visual > path:first-child {
        fill: #dbeafe !important;
        stroke: #60a5fa !important;
        stroke-width: 2px !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id^="ExclusiveGateway_"] .djs-visual > path:not(:first-child):not(.workflow-gateway-marker),
      .workflow-bpmn-canvas .djs-element[data-element-id^="ParallelGateway_"] .djs-visual > path:not(:first-child):not(.workflow-gateway-marker),
      .workflow-bpmn-canvas .djs-element[data-element-id^="InclusiveGateway_"] .djs-visual > path:not(:first-child):not(.workflow-gateway-marker),
      .workflow-bpmn-canvas .djs-element[data-element-id^="InclusiveGateway_"] .djs-visual > circle:not(.workflow-gateway-marker) {
        display: none !important;
      }
      .workflow-bpmn-canvas .workflow-gateway-marker {
        display: inline !important;
        stroke: #3b82f6 !important;
        fill: none !important;
        stroke-width: 3px !important;
        stroke-linecap: round !important;
      }
      .workflow-bpmn-canvas .workflow-approval-node-label {
        fill: #64748b !important;
        font-size: 10px !important;
        font-weight: 500 !important;
        letter-spacing: 0 !important;
        pointer-events: none !important;
      }
      .workflow-bpmn-canvas .workflow-text-annotation-card {
        fill: #eef6ff !important;
        stroke: #93c5fd !important;
        stroke-width: 1.75px !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id^="TextAnnotation_Branch_"] .djs-visual > path {
        display: none !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id^="TextAnnotation_Branch_"] .djs-visual text,
      .workflow-bpmn-canvas .djs-label[data-element-id^="TextAnnotation_Branch_"] text {
        fill: #334155 !important;
        font-size: 11px !important;
        font-weight: 500 !important;
        text-anchor: middle !important;
      }
      .workflow-bpmn-canvas .djs-connection[data-element-id^="Association_Branch_"] .djs-visual > path {
        stroke: #94a3b8 !important;
        stroke-dasharray: 4 4 !important;
        stroke-width: 1.25px !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id^="Approval_"] .djs-visual > path,
      .workflow-bpmn-canvas .djs-element[data-element-id^="Approval_"] .djs-visual > g,
      .workflow-bpmn-canvas .djs-element[data-element-id^="Branch_"] .djs-visual > path,
      .workflow-bpmn-canvas .djs-element[data-element-id^="Branch_"] .djs-visual > g {
        display: none !important;
      }
      .workflow-bpmn-canvas .djs-element[data-element-id^="Approval_"] .djs-visual > text:not(.workflow-approval-node-label),
      .workflow-bpmn-canvas .djs-element[data-element-id^="Branch_"] .djs-visual > text:not(.workflow-approval-node-label) {
        font-size: 12px !important;
        font-weight: 500 !important;
        transform: translateY(7px);
      }
      .workflow-bpmn-canvas .workflow-node-selected .djs-visual > :first-child {
        stroke: #059669 !important;
        stroke-width: 3px !important;
      }
      .workflow-bpmn-canvas {
        overflow: hidden !important;
      }
      .workflow-bpmn-canvas .djs-container {
        height: 100% !important;
        overflow: hidden !important;
        width: 100% !important;
      }
      .workflow-bpmn-canvas .djs-container { --diagram-js-font-family: inherit; }
    `}</style>
  );
}
