import assert from "node:assert/strict";
import test from "node:test";
import type { Graph as G6Graph, IPointerEvent, State } from "@antv/g6";

import { bindMapNetworkInteractions } from "./VisualizationNetworkMapInteraction";

type GraphListener = (event: IPointerEvent) => void;

class FakeGraph {
  private readonly listeners = new Map<string, Set<GraphListener>>();
  private readonly states = new Map<string, State[]>([["center", ["selected"]]]);

  on(eventName: string, listener: GraphListener) {
    const listeners = this.listeners.get(eventName) ?? new Set<GraphListener>();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
  }

  off(eventName: string, listener: GraphListener) {
    this.listeners.get(eventName)?.delete(listener);
  }

  emit(eventName: string, event: IPointerEvent) {
    for (const listener of this.listeners.get(eventName) ?? []) listener(event);
  }

  getData() {
    return {
      nodes: [{ id: "center" }, { id: "neighbor" }, { id: "incoming" }, { id: "unrelated" }],
      edges: [
        { id: "center-neighbor", source: "center", target: "neighbor" },
        { id: "incoming-center", source: "incoming", target: "center" },
        { id: "unrelated-loop", source: "unrelated", target: "unrelated" },
      ],
      combos: [],
    };
  }

  getNeighborNodesData(nodeKey: string) {
    if (nodeKey === "center") return [{ id: "neighbor" }, { id: "incoming" }];
    if (nodeKey === "neighbor") return [{ id: "center" }];
    if (nodeKey === "incoming") return [{ id: "center" }];
    return [];
  }

  getRelatedEdgesData(nodeKey: string) {
    if (nodeKey === "center") {
      return [
        { id: "center-neighbor", source: "center", target: "neighbor" },
        { id: "incoming-center", source: "incoming", target: "center" },
      ];
    }
    if (nodeKey === "neighbor") {
      return [{ id: "center-neighbor", source: "center", target: "neighbor" }];
    }
    if (nodeKey === "incoming") {
      return [{ id: "incoming-center", source: "incoming", target: "center" }];
    }
    if (nodeKey === "unrelated") {
      return [{ id: "unrelated-loop", source: "unrelated", target: "unrelated" }];
    }
    return [];
  }

  getElementState(elementKey: string) {
    return this.states.get(elementKey) ?? [];
  }

  setElementState(states: Record<string, State[]>) {
    for (const [elementKey, state] of Object.entries(states)) this.states.set(elementKey, state);
    return Promise.resolve();
  }
}

function pointerEvent(nodeKey: string, shape: "key" | "label", targetType: IPointerEvent["targetType"] = "node") {
  const keyShape = { className: "key" };
  return {
    targetType,
    originalTarget: shape === "key" ? keyShape : { className: "label" },
    target: { id: nodeKey, getShape: () => keyShape },
  } as unknown as IPointerEvent;
}

test("controlled map hover owns one directed neighborhood and clears it unconditionally on leave", () => {
  const graph = new FakeGraph();
  const container = new EventTarget() as unknown as HTMLElement;
  bindMapNetworkInteractions(graph as unknown as G6Graph, container, undefined, undefined, true);

  graph.emit("node:pointerenter", pointerEvent("center", "key"));
  assert.deepEqual(graph.getElementState("center"), ["selected", "active", "hovered"]);
  assert.deepEqual(graph.getElementState("neighbor"), ["active", "outgoing"]);
  assert.deepEqual(graph.getElementState("incoming"), ["active"]);
  assert.deepEqual(graph.getElementState("center-neighbor"), ["active", "outgoing"]);
  assert.deepEqual(graph.getElementState("incoming-center"), ["active", "incoming"]);
  assert.deepEqual(graph.getElementState("unrelated"), ["inactive"]);
  assert.deepEqual(graph.getElementState("unrelated-loop"), ["inactive"]);

  graph.emit("node:pointerleave", pointerEvent("neighbor", "label"));
  assert.deepEqual(graph.getElementState("center"), ["selected"]);
  assert.deepEqual(graph.getElementState("neighbor"), []);
  assert.deepEqual(graph.getElementState("incoming"), []);
  assert.deepEqual(graph.getElementState("center-neighbor"), []);
  assert.deepEqual(graph.getElementState("incoming-center"), []);
  assert.deepEqual(graph.getElementState("unrelated"), []);
  assert.deepEqual(graph.getElementState("unrelated-loop"), []);
});

test("moving from the node circle onto its label clears hover instead of widening the hit area", () => {
  const graph = new FakeGraph();
  const container = new EventTarget() as unknown as HTMLElement;
  bindMapNetworkInteractions(graph as unknown as G6Graph, container);

  graph.emit("node:pointermove", pointerEvent("center", "key"));
  graph.emit("node:pointermove", pointerEvent("center", "label"));

  assert.deepEqual(graph.getElementState("center"), ["selected"]);
  assert.deepEqual(graph.getElementState("neighbor"), []);
  assert.deepEqual(graph.getElementState("incoming"), []);
});

test("moving directly between node circles replaces the whole hover neighborhood", () => {
  const graph = new FakeGraph();
  const container = new EventTarget() as unknown as HTMLElement;
  bindMapNetworkInteractions(graph as unknown as G6Graph, container);

  graph.emit("node:pointerenter", pointerEvent("center", "key"));
  graph.emit("node:pointerenter", pointerEvent("unrelated", "key"));

  assert.deepEqual(graph.getElementState("center"), ["selected", "inactive"]);
  assert.deepEqual(graph.getElementState("neighbor"), ["inactive"]);
  assert.deepEqual(graph.getElementState("incoming"), ["inactive"]);
  assert.deepEqual(graph.getElementState("center-neighbor"), ["inactive"]);
  assert.deepEqual(graph.getElementState("incoming-center"), ["inactive"]);
  assert.deepEqual(graph.getElementState("unrelated"), ["active", "hovered"]);
  assert.deepEqual(graph.getElementState("unrelated-loop"), ["active"]);
});

test("map click only selects the visible node circle and cleanup removes all listeners", () => {
  const graph = new FakeGraph();
  const container = new EventTarget() as unknown as HTMLElement;
  const selected: string[] = [];
  const cleanup = bindMapNetworkInteractions(
    graph as unknown as G6Graph,
    container,
    (nodeKey) => selected.push(nodeKey),
  );

  graph.emit("node:click", pointerEvent("center", "label"));
  graph.emit("node:click", pointerEvent("center", "key"));
  assert.deepEqual(selected, ["center"]);

  graph.emit("node:pointerenter", pointerEvent("center", "key"));
  container.dispatchEvent(new Event("pointerleave"));
  assert.deepEqual(graph.getElementState("center"), ["selected"]);

  cleanup();
  graph.emit("node:click", pointerEvent("neighbor", "key"));
  assert.deepEqual(selected, ["center"]);
});

test("right click inside a focused map clears hover and navigates back", () => {
  const graph = new FakeGraph();
  const container = new EventTarget() as unknown as HTMLElement;
  let backCount = 0;
  bindMapNetworkInteractions(
    graph as unknown as G6Graph,
    container,
    undefined,
    () => { backCount += 1; },
  );

  graph.emit("node:pointerenter", pointerEvent("center", "key"));
  const contextMenu = new Event("contextmenu", { cancelable: true });
  const dispatched = container.dispatchEvent(contextMenu);

  assert.equal(dispatched, false);
  assert.equal(contextMenu.defaultPrevented, true);
  assert.equal(backCount, 1);
  assert.deepEqual(graph.getElementState("center"), ["selected"]);
  assert.deepEqual(graph.getElementState("neighbor"), []);
});

test("right click keeps the native context menu when the map has no back target", () => {
  const graph = new FakeGraph();
  const container = new EventTarget() as unknown as HTMLElement;
  bindMapNetworkInteractions(graph as unknown as G6Graph, container);

  const contextMenu = new Event("contextmenu", { cancelable: true });
  const dispatched = container.dispatchEvent(contextMenu);

  assert.equal(dispatched, true);
  assert.equal(contextMenu.defaultPrevented, false);
});
