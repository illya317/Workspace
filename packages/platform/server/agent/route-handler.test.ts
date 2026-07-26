import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { AgentRuntimeAbortError, type AgentResponse } from "./runtime/contracts";

const telemetry = {
  inputOtherTokens: 13,
  inputCacheReadTokens: 4,
  inputCacheCreationTokens: 2,
  outputTokens: 6,
  contextUsagePeak: 0.5,
  runtimeStepCount: 1,
  runtimeOutcome: "finished" as const,
};
const runtimeResponse: AgentResponse = {
  type: "answer",
  message: "runtime answer",
  toolUsed: "library.deliverDocuments",
  data: { invalid: true },
  telemetry,
};
let processMessageImpl: () => Promise<AgentResponse> = async () => runtimeResponse;
const execution = {
  requester: { id: 7, username: "requester" },
  actor: { id: 7, username: "requester" },
  profile: null,
};
const session = {
  id: "session-1",
  summaryShort: null,
  pagePath: "/agent",
};
const appendedMessages: Array<Record<string, unknown>> = [];
const cancelledProposalIds: number[] = [];
let finishedRun: Record<string, unknown> | null = null;
let failAgentAppend = false;

mock.module("next/server", {
  namedExports: { NextResponse: { json: (value: unknown) => Response.json(value) } },
} as never);
mock.module("@workspace/platform/server/api", {
  namedExports: {
    jsonErrorResponse: (message: string, status: number) => new Response(
      JSON.stringify({ error: message }),
      { status, headers: { "content-type": "application/json" } },
    ),
  },
} as never);
mock.module("./execution-context", {
  namedExports: {
    AgentExecutionError: class AgentExecutionError extends Error {
      status = 400;
    },
    resolveAgentExecutionContext: async () => execution,
  },
} as never);
mock.module("./identity-context", {
  namedExports: {
    buildAgentIdentityAnswer: () => "identity answer",
    buildAgentIdentityContext: () => "identity context",
  },
} as never);
mock.module("./orchestrator", {
  namedExports: { processMessage: async () => processMessageImpl() },
} as never);
mock.module("./proposals", {
  namedExports: {
    cancelProposal: async (proposalId: number) => {
      cancelledProposalIds.push(proposalId);
      return { proposalId, status: "cancelled", message: "cancelled" };
    },
  },
} as never);
mock.module("./route-input", {
  namedExports: { parseAgentRequest: async () => ({ ok: false, response: new Response(null, { status: 400 }) }) },
} as never);
mock.module("./sessions", {
  namedExports: {
    appendAgentSessionMessage: async (_session: unknown, message: Record<string, unknown>) => {
      if (failAgentAppend && message.role === "agent") throw new Error("session append failed");
      appendedMessages.push(message);
      return session;
    },
    buildAgentHistory: () => [],
    buildContextualAgentMessage: (message: string) => message,
    compactAgentSessionIfNeeded: async () => ({ ...session, summaryShort: "compact" }),
    linkAgentProposalToSession: async () => undefined,
    prepareAgentSession: async () => ({ session }),
    storeAgentSessionImages: async () => [],
    toStoredImageAttachment: () => ({}),
  },
} as never);
mock.module("./stream-response", {
  namedExports: {
    createAgentStreamResponse: async (
      signal: AbortSignal,
      work: (input: { emitDelta: (delta: string) => void; signal: AbortSignal }) => Promise<unknown>,
    ) => Response.json(await work({ emitDelta: () => undefined, signal })),
  },
} as never);
mock.module("./run-audit", {
  namedExports: {
    startAgentRun: async () => "run-1",
    finishAgentRun: async (_id: string, input: Record<string, unknown>) => {
      finishedRun = input;
    },
  },
} as never);

const { handleParsedAgentMessageStreamRequest } = await import("./route-handler");

test("stream transform is applied before session and run terminal audit", async () => {
  appendedMessages.length = 0;
  cancelledProposalIds.length = 0;
  finishedRun = null;
  failAgentAppend = false;
  processMessageImpl = async () => runtimeResponse;
  const response = await handleParsedAgentMessageStreamRequest(
    { body: { message: "deliver", agentProfileId: null }, imageFiles: [] },
    execution.requester,
    [],
    new AbortController().signal,
    async (payload) => ({
      ...payload,
      type: "error",
      message: "资料发送结果无效，请重新确认资料范围。",
      data: undefined,
    }),
  );
  const body = await response.json();

  assert.equal(body.type, "error");
  assert.equal(body.message, "资料发送结果无效，请重新确认资料范围。");
  assert.deepEqual(body.session, { id: "session-1", summaryShort: "compact" });
  assert.deepEqual(appendedMessages.at(-1), {
    role: "agent",
    content: "资料发送结果无效，请重新确认资料范围。",
    responseType: "error",
    proposal: undefined,
    proposalStatus: undefined,
  });
  assert.deepEqual(finishedRun, {
    status: "failed",
    toolKey: "library.deliverDocuments",
    resultType: "error",
    proposalId: undefined,
    errorMessage: "资料发送结果无效，请重新确认资料范围。",
    telemetry,
  });
});

test("runtime abort telemetry is persisted with the aborted API result", async () => {
  appendedMessages.length = 0;
  cancelledProposalIds.length = 0;
  finishedRun = null;
  failAgentAppend = false;
  const partialTelemetry = { ...telemetry, runtimeOutcome: "cancelled" as const };
  processMessageImpl = async () => {
    throw new AgentRuntimeAbortError("request disconnected", partialTelemetry, {
      type: "proposal",
      message: "partial proposal",
      toolUsed: "source.proposePullRequest",
      proposal: { id: 43, actionKey: "source.submit", targetType: "PullRequest", diff: {} },
      telemetry: partialTelemetry,
    });
  };

  const response = await handleParsedAgentMessageStreamRequest(
    { body: { message: "cancel", agentProfileId: null }, imageFiles: [] },
    execution.requester,
    [],
    new AbortController().signal,
  );
  const body = await response.json();

  assert.equal(body.type, "error");
  assert.equal(body.message, "请求已中止。");
  assert.deepEqual(cancelledProposalIds, [43]);
  assert.deepEqual(finishedRun, {
    status: "aborted",
    toolKey: "source.proposePullRequest",
    resultType: "error",
    proposalId: 43,
    errorMessage: "request disconnected",
    telemetry: partialTelemetry,
  });
});

test("internal runtime timeout is failed instead of being reported as a client abort", async () => {
  appendedMessages.length = 0;
  cancelledProposalIds.length = 0;
  finishedRun = null;
  failAgentAppend = false;
  const timeoutTelemetry = { ...telemetry, runtimeOutcome: "timed_out" as const };
  processMessageImpl = async () => {
    throw new AgentRuntimeAbortError(
      "Agent turn timed out",
      timeoutTelemetry,
      undefined,
      "runtime_timeout",
    );
  };

  const response = await handleParsedAgentMessageStreamRequest(
    { body: { message: "timeout", agentProfileId: null }, imageFiles: [] },
    execution.requester,
    [],
    new AbortController().signal,
  );
  const body = await response.json();

  assert.equal(body.type, "error");
  assert.equal(body.message, "处理请求超时，请重试。");
  assert.deepEqual(finishedRun, {
    status: "failed",
    toolKey: undefined,
    resultType: "error",
    proposalId: undefined,
    errorMessage: "Agent turn timed out",
    telemetry: timeoutTelemetry,
  });
});

test("cancelled runtime cannot expose a pending proposal as a successful result", async () => {
  appendedMessages.length = 0;
  cancelledProposalIds.length = 0;
  finishedRun = null;
  failAgentAppend = false;
  processMessageImpl = async () => ({
    type: "proposal",
    message: "please confirm",
    proposal: { id: 44, actionKey: "source.submit", targetType: "PullRequest", diff: {} },
    telemetry: { ...telemetry, runtimeOutcome: "cancelled" },
  });

  const response = await handleParsedAgentMessageStreamRequest(
    { body: { message: "proposal then cancel", agentProfileId: null }, imageFiles: [] },
    execution.requester,
    [],
    new AbortController().signal,
  );
  const body = await response.json();

  assert.equal(body.type, "error");
  assert.equal(body.message, "请求已中止。");
  assert.equal(body.proposal, undefined);
  assert.deepEqual(cancelledProposalIds, [44]);
  assert.deepEqual(finishedRun, {
    status: "aborted",
    toolKey: undefined,
    resultType: "error",
    proposalId: 44,
    errorMessage: "Agent runtime cancelled before completion",
    telemetry: { ...telemetry, runtimeOutcome: "cancelled" },
  });
});

test("session append failure still closes AgentRun before best-effort error transcript", async (context) => {
  context.mock.method(console, "error", () => undefined);
  appendedMessages.length = 0;
  cancelledProposalIds.length = 0;
  finishedRun = null;
  failAgentAppend = true;
  processMessageImpl = async () => runtimeResponse;

  const response = await handleParsedAgentMessageStreamRequest(
    { body: { message: "answer with broken session storage", agentProfileId: null }, imageFiles: [] },
    execution.requester,
    [],
    new AbortController().signal,
  );
  const body = await response.json();

  assert.equal(body.type, "error");
  assert.equal(body.message, "处理请求时出错：session append failed");
  assert.deepEqual(finishedRun, {
    status: "failed",
    toolKey: "library.deliverDocuments",
    resultType: "error",
    proposalId: undefined,
    errorMessage: "session append failed",
    telemetry,
  });
  assert.equal(appendedMessages.filter((message) => message.role === "agent").length, 0);
});
