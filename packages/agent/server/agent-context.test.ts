import assert from "node:assert/strict";
import test from "node:test";
import type { SessionUser } from "@workspace/platform/types";

import {
  AGENT_MODEL_CONTEXT_CHAR_BUDGET,
  serializeAgentModelContext,
} from "./model-context";
import { processMessage } from "./orchestrator";
import type { AgentRuntime, AgentRuntimeInput } from "./runtime/contracts";
import {
  buildAgentHistory,
  type AgentSessionRow,
  type AgentStoredMessage,
  type PreparedAgentSession,
} from "./sessions";
import type { AgentTool } from "./tools";

const user: SessionUser = { id: 1, username: "agent-test" };
const session: AgentSessionRow = {
  id: "sess_00000000000000000000000000000000",
  userId: user.id,
  agentProfileId: null,
  status: "active",
  pagePath: null,
  contextLabel: null,
  title: null,
  storageKey: "sessions/test",
  summaryShort: null,
  summaryLongStorageKey: null,
  messageCount: 0,
  compactedMessageCount: 0,
  byteSize: 0,
};

function storedMessage(index: number): AgentStoredMessage {
  return {
    id: `msg_${index}`,
    role: index % 2 === 0 ? "user" : "agent",
    content: `message-${index}`,
    createdAt: new Date(index).toISOString(),
  };
}

function preparedSession(messageCount: number, summaryLong: string | null, compactedMessageCount = 0): PreparedAgentSession {
  return {
    session: { ...session, compactedMessageCount },
    messages: Array.from({ length: messageCount }, (_, index) => storedMessage(index)),
    summaryLong,
  };
}

function tool(key: string): AgentTool {
  return {
    key,
    label: key,
    description: `Tool ${key}`,
    requiredPermissions: [],
    mutates: false,
    execute: async () => ({ type: "data", message: "ok" }),
  };
}

test("session history keeps the compressed summary plus every uncompacted message", () => {
  const history = buildAgentHistory(preparedSession(20, "decisions from older turns", 4));

  assert.equal(history.length, 17);
  assert.match(history[0].content, /历史摘要（压缩）：/);
  assert.match(history[0].content, /decisions from older turns/);
  assert.deepEqual(
    history.slice(1).map((message) => message.content),
    Array.from({ length: 16 }, (_, index) => `message-${index + 4}`),
  );
});

test("session history has no fixed turn or message-count cap", () => {
  const history = buildAgentHistory(preparedSession(1_000, null));

  assert.equal(history.length, 1_000);
  assert.equal(history[0].content, "message-0");
  assert.equal(history.at(-1)?.content, "message-999");
});

test("session history uses a character budget for unusually large conversations", () => {
  const prepared = preparedSession(100, null);
  prepared.messages = prepared.messages.map((message, index) => ({
    ...message,
    content: `${index}:`.padEnd(2_500, "x"),
  }));
  const history = buildAgentHistory(prepared);

  assert.ok(history.length > 16);
  assert.ok(history.length < prepared.messages.length);
  assert.ok(history.reduce((total, message) => total + message.content.length, 0) <= 160_000);
  assert.match(history.at(-1)?.content ?? "", /^99:/);
});

test("session history does not apply a legacy per-message fallback truncation", () => {
  const content = `long-message:${"x".repeat(100_000)}`;
  const history = buildAgentHistory(preparedSession(0, null), [{ role: "agent", content }]);

  assert.equal(history.length, 1);
  assert.equal(history[0].content, content);
});

test("session history preserves proposal diff and lifecycle feedback for the next turn", () => {
  const prepared = preparedSession(0, null);
  prepared.messages = [{
    id: "msg_proposal",
    role: "agent",
    content: "已按你的反馈生成待确认变更。",
    createdAt: new Date().toISOString(),
    responseType: "proposal",
    proposal: {
      id: 42,
      actionKey: "work.item.create",
      targetType: "WorkItem",
      targetId: "123",
      diff: { title: "准备周报", priority: "high" },
    },
    proposalStatus: "failed",
  }];

  const history = buildAgentHistory(prepared);

  assert.equal(history.length, 1);
  assert.match(history[0].content, /\[Workspace proposal state\]/);
  assert.match(history[0].content, /proposalId=42/);
  assert.match(history[0].content, /actionKey=work\.item\.create/);
  assert.match(history[0].content, /targetId=123/);
  assert.match(history[0].content, /status=failed/);
  assert.match(history[0].content, /"title":"准备周报"/);
});

test("oversize model context remains bounded valid JSON and reports truncation", () => {
  const serialized = serializeAgentModelContext({
    records: Array.from({ length: 2_000 }, (_, index) => ({
      index,
      text: `quoted \\"evidence\\" ${"x".repeat(80)}`,
    })),
  });

  assert.ok(serialized.length <= AGENT_MODEL_CONTEXT_CHAR_BUDGET);
  const parsed = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.reason, "model_context_exceeded_character_budget");
  assert.equal(typeof parsed.jsonPrefix, "string");
});

test("model context serialization handles multibyte and non-JSON values without throwing", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const cases: unknown[] = [{ text: "证据".repeat(40_000) }, { count: 1n }, circular];

  for (const value of cases) {
    const serialized = serializeAgentModelContext(value);
    assert.ok(serialized.length <= AGENT_MODEL_CONTEXT_CHAR_BUDGET);
    assert.doesNotThrow(() => JSON.parse(serialized));
  }
});

test("policy boundary passes only pre-authorized tools and context to the SDK runtime", async () => {
  let received: AgentRuntimeInput | undefined;
  const runtime: AgentRuntime = {
    async runTurn(input) {
      received = input;
      return { type: "answer", message: "sdk answer" };
    },
  };
  const allowed = tool("allowed");
  const denied = tool("denied");
  const history = [{ role: "user" as const, content: "older question" }];

  const response = await processMessage("current question", user, [allowed, denied], history, {
    runtime,
    identityContext: "authenticated user context",
    resolveToolAccess: async () => ({
      tools: [allowed],
      capabilities: [{ key: allowed.key, label: allowed.label, description: allowed.description, source: "tool" }],
    }),
  });

  assert.equal(response.message, "sdk answer");
  assert.deepEqual(received?.tools, [allowed]);
  assert.deepEqual(received?.history, history);
  assert.equal(received?.identityContext, "authenticated user context");
});

test("runtime is not called when no tool survives Workspace authorization", async () => {
  let called = false;
  const runtime: AgentRuntime = {
    async runTurn() {
      called = true;
      return { type: "answer", message: "unexpected" };
    },
  };

  const response = await processMessage("help", user, [tool("denied")], [], {
    runtime,
    resolveToolAccess: async () => ({ tools: [], capabilities: [] }),
  });

  assert.equal(called, false);
  assert.match(response.message, /没有可用功能/);
});

test("identity question is answered before invoking the SDK runtime", async () => {
  const response = await processMessage("我是谁？", user, [tool("allowed")], [], {
    identityAnswer: "你是 agent-test。",
    runtime: { async runTurn() { throw new Error("must not run"); } },
  });

  assert.equal(response.message, "你是 agent-test。");
});
