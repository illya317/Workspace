import assert from "node:assert/strict";
import test from "node:test";
import type { SessionUser } from "@workspace/platform/types";
import {
  EventStream,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Model,
} from "@earendil-works/pi-ai";

import { createHumanAgentExecutionContext } from "../execution";
import type { AgentTool } from "../tools";
import { PiDeepSeekAgentRuntime } from "./pi-deepseek-runtime";

const user: SessionUser = { id: 7, username: "pi-runtime-test" };
const execution = createHumanAgentExecutionContext(user);

const model: Model<"openai-completions"> = {
  id: "deepseek-v4-flash",
  name: "DeepSeek V4 Flash",
  api: "openai-completions",
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 384_000,
};

function usage() {
  return {
    input: 12,
    output: 3,
    cacheRead: 2,
    cacheWrite: 1,
    totalTokens: 18,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function assistantMessage(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: usage(),
    stopReason,
    timestamp: Date.now(),
  };
}

function streamMessage(message: AssistantMessage, delta?: string) {
  const stream = new EventStream<AssistantMessageEvent, AssistantMessage>(
    (event) => event.type === "done" || event.type === "error",
    (event) => {
      if (event.type === "done") return event.message;
      if (event.type === "error") return event.error;
      throw new Error("Unexpected non-terminal event");
    },
  );
  queueMicrotask(() => {
    stream.push({ type: "start", partial: message });
    if (delta) {
      stream.push({ type: "text_start", contentIndex: 0, partial: message });
      stream.push({ type: "text_delta", contentIndex: 0, delta, partial: message });
      stream.push({ type: "text_end", contentIndex: 0, content: delta, partial: message });
    }
    stream.push({ type: "done", reason: message.stopReason as "stop" | "length" | "toolUse", message });
  });
  return stream;
}

function testTool(result: Awaited<ReturnType<AgentTool["execute"]>>, mutates = false): AgentTool {
  return {
    key: "finance.testRead",
    label: "Test read",
    description: "Read deterministic test data",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiredPermissions: [],
    mutates,
    execute: async () => result,
  };
}

test("Pi DeepSeek runtime streams a text answer and records Pi usage", async () => {
  let observedApiKey: string | undefined;
  const runtime = new PiDeepSeekAgentRuntime({
    apiKey: "test-key",
    model,
    streamFn: (_model, _context, options) => {
      observedApiKey = options?.apiKey;
      const message = assistantMessage([{ type: "text", text: "Pi answer" }]);
      return streamMessage(message, "Pi answer");
    },
    resolveToolAccess: async (_principal, tools) => ({ tools, capabilities: [] }),
  });
  const deltas: string[] = [];

  const response = await runtime.runTurn({
    message: "answer me",
    execution,
    tools: [testTool({ type: "data", message: "unused", data: null })],
    history: [],
    images: [],
    onTextDelta: (delta) => deltas.push(delta),
  });

  assert.equal(observedApiKey, "test-key");
  assert.equal(response.type, "answer");
  assert.equal(response.message, "Pi answer");
  assert.deepEqual(deltas, ["Pi answer"]);
  assert.deepEqual(response.telemetry, {
    inputOtherTokens: 12,
    inputCacheReadTokens: 2,
    inputCacheCreationTokens: 1,
    outputTokens: 3,
    contextUsagePeak: 18,
    runtimeStepCount: 1,
    runtimeOutcome: "finished",
  });
});

test("Pi DeepSeek runtime reauthorizes a write and preserves its Workspace proposal", async () => {
  const proposal = {
    id: 41,
    actionKey: "finance.test",
    targetType: "Record",
    diff: { value: 2 },
  };
  let executeCount = 0;
  let streamCount = 0;
  const runtime = new PiDeepSeekAgentRuntime({
    apiKey: "test-key",
    model,
    streamFn: (_model, context) => {
      streamCount += 1;
      const tool = context.tools?.find((candidate) => candidate.name !== "workspace_request_clarification");
      assert.ok(tool);
      return streamMessage(assistantMessage([{
        type: "toolCall",
        id: "tool-1",
        name: tool.name,
        arguments: {},
      }], "toolUse"));
    },
    resolveToolAccess: async (_principal, tools) => ({ tools, capabilities: [] }),
  });
  const tool = testTool({ type: "proposal", message: "请确认", proposal }, true);
  tool.execute = async () => {
    executeCount += 1;
    return { type: "proposal", message: "请确认", proposal };
  };

  const response = await runtime.runTurn({
    message: "create change",
    execution,
    tools: [tool],
    history: [],
    images: [],
  });

  assert.equal(streamCount, 1);
  assert.equal(executeCount, 1);
  assert.equal(response.type, "proposal");
  assert.equal(response.message, "请确认");
  assert.deepEqual(response.proposal, proposal);
  assert.equal(response.telemetry?.runtimeOutcome, "finished");
});

test("Pi DeepSeek runtime rejects image input before contacting the model", async () => {
  const runtime = new PiDeepSeekAgentRuntime({
    apiKey: "test-key",
    model,
    streamFn: () => {
      throw new Error("model must not be called");
    },
  });
  const response = await runtime.runTurn({
    message: "inspect image",
    execution,
    tools: [],
    history: [],
    images: [{ id: "image-1", fileName: "a.png", mimeType: "image/png", size: 10, dataUrl: "data:image/png;base64,AA==" }],
  });
  assert.equal(response.type, "error");
  assert.match(response.message, /只支持文本输入/);
});

test("Pi DeepSeek runtime fails closed when a write tool violates proposal policy", async () => {
  const runtime = new PiDeepSeekAgentRuntime({
    apiKey: "test-key",
    model,
    streamFn: (_model, context) => {
      const tool = context.tools?.find((candidate) => candidate.name !== "workspace_request_clarification");
      assert.ok(tool);
      return streamMessage(assistantMessage([{
        type: "toolCall",
        id: "tool-policy-1",
        name: tool.name,
        arguments: {},
      }], "toolUse"));
    },
    resolveToolAccess: async (_principal, tools) => ({ tools, capabilities: [] }),
  });

  await assert.rejects(() => runtime.runTurn({
    message: "write without a proposal",
    execution,
    tools: [testTool({ type: "data", message: "incorrect direct result", data: null }, true)],
    history: [],
    images: [],
  }), /未返回 proposal/);
});
