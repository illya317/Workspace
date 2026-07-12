import assert from "node:assert/strict";
import test from "node:test";

import { agentToolCallRounds, MAX_TOOL_CALL_ROUNDS_PER_MESSAGE } from "./tool-loop-policy";

test("native tool calls allow ten model rounds and reset for each user message", () => {
  assert.equal(MAX_TOOL_CALL_ROUNDS_PER_MESSAGE, 10);
  assert.deepEqual([...agentToolCallRounds()], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual([...agentToolCallRounds()], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
