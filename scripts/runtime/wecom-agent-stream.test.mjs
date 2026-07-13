import assert from "node:assert/strict";
import test from "node:test";

import { forwardSafeAgentProgress, readAgentEventStream } from "./wecom-agent-stream.mjs";

test("reads NDJSON Agent events across arbitrary response chunks", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"event":"status","message":"正在'));
      controller.enqueue(encoder.encode('处理"}\n{"event":"delta","delta":"完成"}\n'));
      controller.enqueue(encoder.encode('{"event":"result","data":{"type":"answer","message":"完成"}}\n'));
      controller.close();
    },
  });
  const events = [];
  const result = await readAgentEventStream(new Response(stream), (event) => events.push(event.event));

  assert.deepEqual(events, ["status", "delta", "result"]);
  assert.deepEqual(result, { type: "answer", message: "完成" });
});

test("forwards only safe progress and never publishes model draft deltas", () => {
  const calls = [];
  const replyStream = {
    update(message) { calls.push(["update", message]); },
    touch() { calls.push(["touch"]); },
  };

  forwardSafeAgentProgress({ event: "status", message: "正在处理…" }, replyStream);
  forwardSafeAgentProgress({ event: "delta", delta: "我无法发送文件" }, replyStream);
  forwardSafeAgentProgress({ event: "heartbeat" }, replyStream);
  forwardSafeAgentProgress({ event: "result", data: { message: "已发送" } }, replyStream);

  assert.deepEqual(calls, [["update", "正在处理…"], ["touch"]]);
});
