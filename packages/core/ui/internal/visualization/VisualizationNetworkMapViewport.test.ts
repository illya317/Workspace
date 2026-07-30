import assert from "node:assert/strict";
import test from "node:test";
import type { Graph as G6Graph } from "@antv/g6";

import {
  fitMapNetworkView,
  MAP_MIN_ZOOM,
} from "./VisualizationNetworkMapViewport";

test("fit view restores the readable minimum when content would become a thumbnail", async () => {
  const calls: string[] = [];
  const graph = {
    fitView: async () => { calls.push("fit"); },
    getZoom: () => 0.08,
    zoomTo: async (zoom: number) => { calls.push(`zoom:${zoom}`); },
  } as unknown as G6Graph;

  await fitMapNetworkView(graph);

  assert.deepEqual(calls, ["fit", `zoom:${MAP_MIN_ZOOM}`]);
});

test("fit view preserves a naturally readable zoom", async () => {
  const calls: string[] = [];
  const graph = {
    fitView: async () => { calls.push("fit"); },
    getZoom: () => 0.8,
    zoomTo: async (zoom: number) => { calls.push(`zoom:${zoom}`); },
  } as unknown as G6Graph;

  await fitMapNetworkView(graph);

  assert.deepEqual(calls, ["fit"]);
});
