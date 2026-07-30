import assert from "node:assert/strict";
import test from "node:test";
import type { SessionUser } from "@workspace/platform/types";

import { createHumanAgentExecutionContext } from "../execution";
import type { AgentTool } from "../tools";
import {
  AgentRuntimeAbortError,
  type AgentResponse,
  type AgentRuntime,
  type AgentRuntimeInput,
} from "./contracts";
import {
  createDefaultAgentRuntime,
  KimiWithPiFallbackRuntime,
  resolveAgentRuntimeProvider,
} from "./default-runtime";

const user: SessionUser = { id: 8, username: "fallback-runtime-test" };

function input(overrides: Partial<AgentRuntimeInput> = {}): AgentRuntimeInput {
  return {
    message: "test",
    execution: createHumanAgentExecutionContext(user),
    tools: [],
    history: [],
    images: [],
    ...overrides,
  };
}

function response(message: string): AgentResponse {
  return { type: "answer", message };
}

function runtime(runTurn: AgentRuntime["runTurn"]): AgentRuntime {
  return { runTurn };
}

test("agent runtime auto mode keeps Kimi primary and enables Pi fallback when configured", () => {
  assert.equal(resolveAgentRuntimeProvider({ PI_DEEPSEEK_API_KEY: "pi-key" }), "kimi-with-pi-fallback");
  assert.equal(resolveAgentRuntimeProvider({ DEEPSEEK_API_KEY: "legacy-key" }), "kimi-with-pi-fallback");
  assert.equal(resolveAgentRuntimeProvider({}), "kimi");
});

test("agent runtime explicit selection is deterministic and validates configuration", () => {
  assert.equal(resolveAgentRuntimeProvider({ AGENT_RUNTIME_PROVIDER: "kimi" }), "kimi");
  assert.equal(resolveAgentRuntimeProvider({ AGENT_RUNTIME_PROVIDER: "pi-deepseek" }), "pi-deepseek");
  assert.throws(
    () => resolveAgentRuntimeProvider({ AGENT_RUNTIME_PROVIDER: "unknown" }),
    /must be auto, kimi, or pi-deepseek/,
  );
});

test("auto mode calls Kimi first and does not call Pi after a successful turn", async () => {
  const calls: string[] = [];
  const selected = createDefaultAgentRuntime(
    { PI_DEEPSEEK_API_KEY: "pi-key" },
    {
      kimi: () => runtime(async () => {
        calls.push("kimi");
        return response("kimi answer");
      }),
      piDeepSeek: () => runtime(async () => {
        calls.push("pi");
        return response("pi answer");
      }),
    },
  );

  assert.deepEqual(await selected.runTurn(input()), response("kimi answer"));
  assert.deepEqual(calls, ["kimi"]);
});

test("falls back to Pi when Kimi fails before output or a Workspace tool", async () => {
  const calls: string[] = [];
  const selected = new KimiWithPiFallbackRuntime(
    runtime(async () => {
      calls.push("kimi");
      throw new Error("Kimi unavailable");
    }),
    runtime(async () => {
      calls.push("pi");
      return response("pi answer");
    }),
  );

  assert.deepEqual(await selected.runTurn(input()), response("pi answer"));
  assert.deepEqual(calls, ["kimi", "pi"]);
});

test("does not retry after Kimi emitted text", async () => {
  let fallbackCalls = 0;
  const selected = new KimiWithPiFallbackRuntime(
    runtime(async (turn) => {
      turn.onTextDelta?.("partial");
      throw new Error("Kimi failed after output");
    }),
    runtime(async () => {
      fallbackCalls += 1;
      return response("pi answer");
    }),
  );

  await assert.rejects(
    selected.runTurn(input({ onTextDelta: () => undefined })),
    /failed after output/,
  );
  assert.equal(fallbackCalls, 0);
});

test("does not retry after Kimi started a Workspace tool", async () => {
  let fallbackCalls = 0;
  const tool: AgentTool = {
    key: "test.read",
    label: "Test read",
    description: "Test tool",
    requiredPermissions: [],
    mutates: false,
    execute: async () => ({ type: "data", message: "ok" }),
  };
  const selected = new KimiWithPiFallbackRuntime(
    runtime(async (turn) => {
      await turn.tools[0].execute({}, turn.execution);
      throw new Error("Kimi failed after tool");
    }),
    runtime(async () => {
      fallbackCalls += 1;
      return response("pi answer");
    }),
  );

  await assert.rejects(selected.runTurn(input({ tools: [tool] })), /failed after tool/);
  assert.equal(fallbackCalls, 0);
});

test("does not retry cancellations or image turns", async () => {
  let fallbackCalls = 0;
  const telemetry = {
    inputOtherTokens: null,
    inputCacheReadTokens: null,
    inputCacheCreationTokens: null,
    outputTokens: null,
    contextUsagePeak: null,
    runtimeStepCount: null,
    runtimeOutcome: "cancelled" as const,
  };
  const fallback = runtime(async () => {
    fallbackCalls += 1;
    return response("pi answer");
  });
  const cancelled = new KimiWithPiFallbackRuntime(
    runtime(async () => {
      throw new AgentRuntimeAbortError("cancelled", telemetry);
    }),
    fallback,
  );
  const image = new KimiWithPiFallbackRuntime(
    runtime(async () => {
      throw new Error("Kimi unavailable");
    }),
    fallback,
  );

  await assert.rejects(cancelled.runTurn(input()), AgentRuntimeAbortError);
  await assert.rejects(image.runTurn(input({
    images: [{ id: "1", fileName: "a.png", mimeType: "image/png", size: 1, dataUrl: "data:image/png;base64,AA==" }],
  })), /Kimi unavailable/);
  assert.equal(fallbackCalls, 0);
});
