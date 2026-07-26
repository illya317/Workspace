import assert from "node:assert/strict";
import test from "node:test";

import { createAgentStreamResponse } from "./stream-response";

test("Agent stream emits status, deltas, and one final result as NDJSON", async () => {
  const requestController = new AbortController();
  const response = createAgentStreamResponse(requestController.signal, async ({ emitDelta }) => {
    emitDelta("第一段");
    emitDelta("第二段");
    return { type: "answer", message: "第一段第二段" };
  });

  assert.equal(response.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(events, [
    { event: "status", message: "正在处理…" },
    { event: "delta", delta: "第一段" },
    { event: "delta", delta: "第二段" },
    { event: "result", data: { type: "answer", message: "第一段第二段" } },
  ]);
});
