import type { Graph as G6Graph, IPointerEvent, State } from "@antv/g6";

import { isMapNodeKeyTarget } from "./VisualizationNetworkMap";

const TRANSIENT_STATES = new Set<State>(["active", "hovered", "inactive", "outgoing", "incoming"]);

type MapTransientState = "active" | "hovered" | "inactive" | "outgoing" | "incoming";

export interface MapNetworkLabelSelection {
  rootNodeKey: string;
  relatedNodeKeys: string[];
}

interface MapNetworkInteractionOptions {
  onNodeSelect?: (nodeKey: string) => void;
  onNavigateBack?: () => void;
  showEdgeDirection?: boolean;
  showRelatedLabels?: boolean;
  onLabelSelectionChange?: (selection: MapNetworkLabelSelection | null) => void;
}

export function bindMapNetworkInteractions(
  graph: G6Graph,
  container: HTMLElement,
  {
    onNodeSelect,
    onNavigateBack,
    showEdgeDirection = false,
    showRelatedLabels = false,
    onLabelSelectionChange,
  }: MapNetworkInteractionOptions = {},
) {
  let hoveredNodeKey: string | null = null;
  let hasTransientState = false;

  const clearHover = () => {
    if (!hasTransientState) return;
    hoveredNodeKey = null;
    hasTransientState = false;
    onLabelSelectionChange?.(null);
    void graph.setElementState(mapElementStates(graph, () => []), false);
  };

  const activateNode = (nodeKey: string) => {
    if (hasTransientState && hoveredNodeKey === nodeKey) return;
    hoveredNodeKey = nodeKey;
    hasTransientState = true;

    const transientStates = new Map<string, MapTransientState[]>([[nodeKey, ["active", "hovered"]]]);
    const outgoingNodeKeys = new Set<string>();
    for (const node of graph.getNeighborNodesData(nodeKey)) transientStates.set(node.id, ["active"]);
    for (const edge of graph.getRelatedEdgesData(nodeKey)) {
      if (!edge.id) continue;
      const outgoing = edge.source === nodeKey;
      const direction = showEdgeDirection ? outgoing ? "outgoing" : "incoming" : undefined;
      transientStates.set(edge.id, direction ? ["active", direction] : ["active"]);
      if (showEdgeDirection) {
        const relatedNodeKey = outgoing ? edge.target : edge.source;
        if (relatedNodeKey !== nodeKey) {
          transientStates.set(relatedNodeKey, ["active", outgoing ? "outgoing" : "incoming"]);
          if (outgoing) outgoingNodeKeys.add(relatedNodeKey);
        }
      }
    }

    onLabelSelectionChange?.({
      rootNodeKey: nodeKey,
      relatedNodeKeys: showRelatedLabels ? [...outgoingNodeKeys].sort() : [],
    });

    void graph.setElementState(mapElementStates(graph, (elementKey) => {
      return transientStates.get(elementKey) ?? ["inactive"];
    }), false);
  };

  const handleNodePointer = (event: IPointerEvent) => {
    if (!isMapNodeKeyTarget(event)) {
      clearHover();
      return;
    }
    activateNode((event.target as { id: string }).id);
  };
  const handleNodeLeave = () => clearHover();
  const handleOutsideNode = () => clearHover();
  const handleNodeClick = (event: IPointerEvent) => {
    if (isMapNodeKeyTarget(event)) onNodeSelect?.((event.target as { id: string }).id);
  };
  const handleContextMenu = (event: MouseEvent) => {
    if (!onNavigateBack) return;
    event.preventDefault();
    clearHover();
    onNavigateBack();
  };

  graph.on("node:pointerenter", handleNodePointer);
  graph.on("node:pointermove", handleNodePointer);
  graph.on("node:pointerleave", handleNodeLeave);
  graph.on("edge:pointermove", handleOutsideNode);
  graph.on("canvas:pointermove", handleOutsideNode);
  graph.on("node:click", handleNodeClick);
  container.addEventListener("pointerleave", handleOutsideNode);
  container.addEventListener("contextmenu", handleContextMenu);

  return () => {
    graph.off("node:pointerenter", handleNodePointer);
    graph.off("node:pointermove", handleNodePointer);
    graph.off("node:pointerleave", handleNodeLeave);
    graph.off("edge:pointermove", handleOutsideNode);
    graph.off("canvas:pointermove", handleOutsideNode);
    graph.off("node:click", handleNodeClick);
    container.removeEventListener("pointerleave", handleOutsideNode);
    container.removeEventListener("contextmenu", handleContextMenu);
  };
}

function mapElementStates(
  graph: G6Graph,
  transientStates: (elementKey: string) => MapTransientState[],
) {
  const data = graph.getData();
  const states: Record<string, State[]> = {};
  for (const { id } of [...data.nodes, ...data.edges]) {
    if (!id) continue;
    states[id] = [
      ...graph.getElementState(id).filter((state) => !TRANSIENT_STATES.has(state)),
      ...transientStates(id),
    ];
  }
  return states;
}
