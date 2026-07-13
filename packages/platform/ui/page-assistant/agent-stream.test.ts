import assert from "node:assert/strict";
import test from "node:test";

import { readAgentStream } from "./agent-stream";

test("browser Agent stream parser exposes deltas and returns the final payload", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"event":"status","message":"正在'));
      controller.enqueue(encoder.encode('处理"}\n{"event":"delta","delta":"部分"}\n'));
      controller.enqueue(encoder.encode('{"event":"result","data":{"type":"answer","message":"完整","session":{"id":"sess_test"}}}\n'));
      controller.close();
    },
  });
  const events: string[] = [];
  const result = await readAgentStream(new Response(stream), (event) => events.push(event.event));

  assert.deepEqual(events, ["status", "delta", "result"]);
  assert.equal(result.message, "完整");
  assert.equal(result.session?.id, "sess_test");
});
