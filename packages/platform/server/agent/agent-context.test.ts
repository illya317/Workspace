import assert from "node:assert/strict";
import test from "node:test";
import type { SessionUser } from "@workspace/platform/types";

import {
  AGENT_MODEL_CONTEXT_CHAR_BUDGET,
  serializeAgentModelContext,
} from "./model-context";
import { buildKimiMessages, parseKimiMaxTokens } from "./model/kimi";
import type {
  AgentModelProvider,
  AgentToolCallMessage,
  HistoryMessage,
  SummarizeInput,
  ToolCallInput,
} from "./model/provider";
import { processMessage } from "./orchestrator";
import {
  buildAgentHistory,
  type AgentSessionRow,
  type AgentStoredMessage,
  type PreparedAgentSession,
} from "./sessions";
import {
  AGENT_TOOL_CALL_REQUEST_CHAR_BUDGET,
  estimateAgentToolCallRequestChars,
  fitAgentToolCallMessages,
} from "./tool-call-context";
import type { AgentTool } from "./tools";

const user: SessionUser = { id: 1, username: "agent-test" };
const resolveTestToolAccess = async (_user: SessionUser, tools: AgentTool[]) => ({
  tools,
  capabilities: tools.map((tool) => ({
    key: tool.key,
    label: tool.label,
    description: tool.description,
    source: "tool" as const,
  })),
});
const testAccessOptions = { resolveToolAccess: resolveTestToolAccess } as never;
const session: AgentSessionRow = {
  id: "sess_00000000000000000000000000000000",
  userId: user.id,
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

function toolReturning(result: Awaited<ReturnType<AgentTool["execute"]>>): AgentTool {
  return {
    key: "test.lookup",
    label: "Test lookup",
    description: "Returns deterministic test data",
    requiredPermissions: [],
    mutates: false,
    canUse: () => true,
    execute: async () => result,
  } as unknown as AgentTool;
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

test("Kimi message assembly preserves the history budget chosen by the session", () => {
  const history = buildAgentHistory(preparedSession(20, "older summary", 4));
  const messages = buildKimiMessages("system", "current question", history);

  assert.equal(messages.length, history.length + 2);
  assert.equal(messages[1].content, history[0].content);
  assert.equal(messages.at(-1)?.content, "current question");
});

test("Kimi max tokens defaults safely and clamps configured values", () => {
  assert.equal(parseKimiMaxTokens(undefined), 32_768);
  assert.equal(parseKimiMaxTokens("not-a-number"), 32_768);
  assert.equal(parseKimiMaxTokens("Infinity"), 32_768);
  assert.equal(parseKimiMaxTokens("0"), 32_768);
  assert.equal(parseKimiMaxTokens("-1"), 32_768);
  assert.equal(parseKimiMaxTokens("12000.5"), 32_768);
  assert.equal(parseKimiMaxTokens("12000"), 12_000);
  assert.equal(parseKimiMaxTokens("999999"), 32_768);
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
  assert.equal(parsed.budgetChars, AGENT_MODEL_CONTEXT_CHAR_BUDGET);
  assert.equal(typeof parsed.jsonPrefix, "string");
});

test("model context serialization handles multibyte and non-JSON values without throwing", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const cases: unknown[] = [
    { text: "证据".repeat(40_000) },
    undefined,
    { count: 1n },
    circular,
  ];

  for (const value of cases) {
    const serialized = serializeAgentModelContext(value);
    assert.ok(serialized.length <= AGENT_MODEL_CONTEXT_CHAR_BUDGET);
    assert.doesNotThrow(() => JSON.parse(serialized));
  }

  const multibyte = JSON.parse(serializeAgentModelContext(cases[0])) as Record<string, unknown>;
  assert.equal(multibyte.truncated, true);
  for (const value of cases.slice(2)) {
    const fallback = JSON.parse(serializeAgentModelContext(value)) as Record<string, unknown>;
    assert.equal(fallback.serializationError, true);
    assert.equal(fallback.reason, "model_context_not_json_serializable");
  }
});

test("non-tool-calling flow sends modelContext to the model but returns full data", async () => {
  const history = buildAgentHistory(preparedSession(20, "older summary"));
  const fullData = { rows: [{ id: 1, uiOnly: "full record" }] };
  let classifyHistory: HistoryMessage[] | undefined;
  let summarizeInput: SummarizeInput | undefined;
  const provider: AgentModelProvider = {
    async classifyIntent(_message, _prompt, receivedHistory) {
      classifyHistory = receivedHistory;
      return { tool: "test.lookup", confidence: 1, params: {} };
    },
    async summarizeResult(input) {
      summarizeInput = input;
      return "model summary";
    },
  };

  const response = await processMessage(
    "lookup",
    user,
    [toolReturning({
      type: "data",
      message: "found",
      data: fullData,
      modelContext: { evidence: ["lean row"] },
    })],
    history,
    provider,
    testAccessOptions,
  );

  assert.equal(classifyHistory, history);
  assert.equal(summarizeInput?.history, history);
  assert.deepEqual(summarizeInput?.result, {
    type: "data",
    message: "found",
    data: { evidence: ["lean row"] },
  });
  assert.deepEqual(response.data, fullData);
});

test("tool-calling flow keeps all assembled history and serializes only modelContext", async () => {
  const history = buildAgentHistory(preparedSession(20, "older summary"));
  const fullData = { rows: [{ id: 1, uiOnly: "full record" }] };
  let call = 0;
  let firstMessages: AgentToolCallMessage[] = [];
  let toolMessage: Extract<AgentToolCallMessage, { role: "tool" }> | undefined;
  const provider: AgentModelProvider = {
    async classifyIntent() {
      throw new Error("classify flow must not run");
    },
    async summarizeResult() {
      throw new Error("summarize flow must not run");
    },
    async callWithTools(input) {
      call += 1;
      if (call === 1) {
        firstMessages = [...input.messages];
        return {
          content: "",
          toolCalls: [{ id: "call_1", name: "test_lookup", arguments: {} }],
        };
      }
      toolMessage = input.messages.findLast(
        (message): message is Extract<AgentToolCallMessage, { role: "tool" }> => message.role === "tool",
      );
      return { content: "done", toolCalls: [] };
    },
  };

  const response = await processMessage(
    "lookup",
    user,
    [toolReturning({
      type: "data",
      message: "found",
      data: fullData,
      modelContext: { evidence: ["lean row"] },
    })],
    history,
    provider,
    testAccessOptions,
  );

  assert.deepEqual(
    firstMessages.slice(1, -1).map((message) => message.content),
    history.map((message) => message.content),
  );
  assert.ok(toolMessage);
  assert.deepEqual(JSON.parse(toolMessage.content), {
    type: "data",
    message: "found",
    data: { evidence: ["lean row"] },
  });
  assert.deepEqual(response.data, fullData);
});

test("tool-loop exhaustion summarizes modelContext while returning full data", async () => {
  const fullData = { rows: [{ id: 1, uiOnly: "full record" }] };
  let round = 0;
  let summarizeInput: SummarizeInput | undefined;
  const provider: AgentModelProvider = {
    async classifyIntent() {
      throw new Error("classify flow must not run");
    },
    async summarizeResult(input) {
      summarizeInput = input;
      return "final summary";
    },
    async callWithTools() {
      round += 1;
      return {
        content: "",
        toolCalls: [{ id: `call_${round}`, name: "test_lookup", arguments: {} }],
      };
    },
  };

  const response = await processMessage(
    "lookup",
    user,
    [toolReturning({
      type: "data",
      message: "found",
      data: fullData,
      modelContext: { evidence: ["lean row"] },
    })],
    [],
    provider,
    testAccessOptions,
  );

  assert.equal(round, 10);
  assert.deepEqual(summarizeInput?.result, {
    type: "data",
    message: "found",
    data: { evidence: ["lean row"] },
  });
  assert.deepEqual(response.data, fullData);
});

test("native tool calls share one bounded request budget across preload and accumulated rounds", async () => {
  const prepared = preparedSession(80, null);
  prepared.messages = prepared.messages.map((message, index) => ({
    ...message,
    content: `history-${index}:`.padEnd(2_000, '"'),
  }));
  const history = buildAgentHistory(prepared);
  assert.equal(history.reduce((total, message) => total + message.content.length, 0), 160_000);

  const sourceTool = {
    key: "source.searchWorkspaceCode",
    label: "Source preload",
    description: "Returns source context",
    requiredPermissions: [],
    mutates: false,
    canUse: () => true,
    execute: async () => ({
      type: "data",
      message: "source found",
      modelContext: { evidence: `preload-evidence:${"p".repeat(40_000)}` },
    }),
  } as unknown as AgentTool;
  let lookupExecution = 0;
  const lookupTool = {
    key: "test.lookup",
    label: "Test lookup",
    description: "Returns large deterministic evidence",
    requiredPermissions: [],
    mutates: false,
    canUse: () => true,
    execute: async () => {
      lookupExecution += 1;
      return {
        type: "data",
        message: "found",
        modelContext: {
          evidence: `lookup-evidence-${lookupExecution}:${"x".repeat(40_000)}`,
        },
      };
    },
  } as unknown as AgentTool;

  const requests: Array<Pick<ToolCallInput, "messages" | "tools">> = [];
  let requestRound = 0;
  const provider: AgentModelProvider = {
    async classifyIntent() {
      throw new Error("classify flow must not run");
    },
    async summarizeResult() {
      throw new Error("summarize flow must not run");
    },
    async callWithTools(input) {
      requestRound += 1;
      requests.push({ messages: input.messages, tools: input.tools });
      if (requestRound === 4) return { content: "done", toolCalls: [] };
      return {
        content: "",
        toolCalls: [1, 2].map((suffix) => ({
          id: `round_${requestRound}_call_${suffix}`,
          name: "test_lookup",
          arguments: {},
        })),
      };
    },
  };

  const question = "源码架构怎么实现？";
  const response = await processMessage(
    question,
    user,
    [sourceTool, lookupTool],
    history,
    provider,
    testAccessOptions,
  );

  assert.equal(response.message, "done");
  assert.equal(requests.length, 4);
  for (const request of requests) {
    assert.ok(
      estimateAgentToolCallRequestChars(request.messages, request.tools)
        <= AGENT_TOOL_CALL_REQUEST_CHAR_BUDGET,
    );
    assert.ok(request.messages.some((message) => message.role === "system"));
    assert.ok(request.messages.some((message) => message.role === "user" && message.content === question));

    const assistantCallIds = request.messages.flatMap((message) => (
      message.role === "assistant" ? (message.tool_calls ?? []).map((call) => call.id) : []
    ));
    const toolResultIds = request.messages.flatMap((message) => (
      message.role === "tool" ? [message.tool_call_id] : []
    ));
    assert.deepEqual([...toolResultIds].sort(), [...assistantCallIds].sort());
  }

  const firstRequestText = JSON.stringify(requests[0]?.messages);
  assert.match(firstRequestText, /preload-evidence/);
  assert.ok(requests[0]?.messages.length < history.length + 3);

  assert.match(JSON.stringify(requests[1]?.messages), /lookup-evidence-1/);
  assert.match(JSON.stringify(requests[1]?.messages), /lookup-evidence-2/);
  assert.match(JSON.stringify(requests[2]?.messages), /lookup-evidence-3/);
  assert.match(JSON.stringify(requests[2]?.messages), /lookup-evidence-4/);
  const finalRequestText = JSON.stringify(requests[3]?.messages);
  assert.match(finalRequestText, /lookup-evidence-5/);
  assert.match(finalRequestText, /lookup-evidence-6/);
  assert.doesNotMatch(finalRequestText, /lookup-evidence-1/);
});

test("tool-call budget keeps recent plain history as complete contiguous turns", () => {
  const messages: AgentToolCallMessage[] = [
    { role: "system", content: "system" },
    { role: "user", content: `old-user:${"u".repeat(500)}` },
    { role: "assistant", content: "old-assistant" },
    { role: "user", content: "recent-user" },
    { role: "assistant", content: "recent-assistant" },
    { role: "user", content: "current-user" },
  ];
  const budgetIfOldAssistantWereOrphaned = estimateAgentToolCallRequestChars([
    messages[0],
    messages[2],
    messages[3],
    messages[4],
    messages[5],
  ] as AgentToolCallMessage[], []);

  const fitted = fitAgentToolCallMessages(messages, [], budgetIfOldAssistantWereOrphaned);

  assert.deepEqual(
    fitted.map((message) => message.content),
    ["system", "recent-user", "recent-assistant", "current-user"],
  );
  assert.ok(estimateAgentToolCallRequestChars(fitted, []) <= budgetIfOldAssistantWereOrphaned);
});

test("large image data URLs retain transport data but use a fixed model-context estimate", async () => {
  const dataUrl = `data:image/png;base64,${"a".repeat(300 * 1024)}`;
  let receivedInput: Pick<ToolCallInput, "messages" | "tools"> | undefined;
  const provider: AgentModelProvider = {
    async classifyIntent() {
      throw new Error("classify flow must not run");
    },
    async summarizeResult() {
      throw new Error("summarize flow must not run");
    },
    async callWithTools(input) {
      receivedInput = { messages: input.messages, tools: input.tools };
      return { content: "image received", toolCalls: [] };
    },
  };

  const response = await processMessage(
    "分析这张图片",
    user,
    [toolReturning({ type: "data", message: "unused" })],
    [],
    provider,
    ({
      resolveToolAccess: resolveTestToolAccess,
      images: [{
        id: "image-1",
        fileName: "screenshot.png",
        mimeType: "image/png",
        size: 300 * 1024,
        dataUrl,
      }],
    } as never),
  );

  assert.equal(response.message, "image received");
  assert.ok(receivedInput);
  assert.ok(
    estimateAgentToolCallRequestChars(receivedInput.messages, receivedInput.tools)
      <= AGENT_TOOL_CALL_REQUEST_CHAR_BUDGET,
  );
  const imageMessage = receivedInput.messages.find((message) => message.role === "user");
  assert.ok(imageMessage && Array.isArray(imageMessage.content));
  const imagePart = imageMessage.content.find((part) => part.type === "image_url");
  assert.equal(imagePart?.image_url.url, dataUrl);
});
