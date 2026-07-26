import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ProtocolClient,
  type ExternalTool,
  type RunResult,
  type StreamEvent,
} from "@moonshot-ai/kimi-agent-sdk";
import type { SessionUser } from "@workspace/platform/types";

import type { AgentTool } from "../tools";
import { createHumanAgentExecutionContext } from "../execution";
import { AgentRuntimeAbortError } from "./contracts";
import { createKimiToolGuard, KimiAgentRuntime } from "./kimi-runtime";

const user: SessionUser = { id: 7, username: "runtime-test" };
const execution = createHumanAgentExecutionContext(user);

function fakeClient(
  onPrompt: (tools: ExternalTool[]) => Promise<void>,
  turn: {
    events?: StreamEvent[];
    result?: RunResult;
    eventError?: Error;
    hangAfterEvents?: boolean;
    onStart?: (options: Parameters<ProtocolClient["start"]>[0]) => Promise<void> | void;
    onQuestionResponse?: (
      requestId: string,
      questionRequestId: string,
      answers: Record<string, string>,
      tools: ExternalTool[],
    ) => Promise<void> | void;
  } = {},
) {
  let externalTools: ExternalTool[] = [];
  const client = {
    async start(options: Parameters<ProtocolClient["start"]>[0]) {
      externalTools = options.externalTools ?? [];
      await turn.onStart?.(options);
      return {
        protocol_version: "1.10",
        server: { name: "Kimi Code CLI", version: "1.48.0" },
        slash_commands: [],
        external_tools: { accepted: externalTools.map((tool) => tool.name), rejected: [] },
        capabilities: { supports_question: true },
      };
    },
    async stop() {},
    sendPrompt() {
      const events = (async function* (): AsyncGenerator<StreamEvent> {
        await onPrompt(externalTools);
        const emitted = turn.events ?? [
          { type: "ContentPart", payload: { type: "text", text: "sdk result" } } as StreamEvent,
        ];
        for (const event of emitted) yield event;
        if (turn.eventError) throw turn.eventError;
        if (turn.hangAfterEvents) await new Promise<void>(() => undefined);
      })();
      return { events, result: Promise.resolve(turn.result ?? { status: "finished" as const }) };
    },
    async sendCancel() {},
    async sendApproval() {},
    async sendQuestionResponse(requestId: string, questionRequestId: string, answers: Record<string, string>) {
      await turn.onQuestionResponse?.(requestId, questionRequestId, answers, externalTools);
    },
  };
  return client;
}

function toolReturning(
  result: Awaited<ReturnType<AgentTool["execute"]>>,
  mutates: boolean,
  writeMode?: AgentTool["writeMode"],
): AgentTool {
  return {
    key: "finance.testWrite",
    label: "Test write",
    description: "Create a deterministic test proposal",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiredPermissions: [],
    mutates,
    ...(writeMode ? { writeMode } : {}),
    execute: async () => result,
  };
}

test("wire hook blocks every non-Workspace tool", async () => {
  const guard = createKimiToolGuard(new Set(["workspace_finance_testWrite"]));
  const base = {
    id: "hook-1",
    subscription_id: "workspace-tool-allowlist",
    event: "PreToolUse",
    input_data: {},
  };

  assert.deepEqual(await guard({ ...base, target: "workspace_finance_testWrite" }), { action: "allow" });
  assert.deepEqual(await guard({ ...base, target: "Shell" }), {
    action: "block",
    reason: "Tool Shell is outside the Workspace allowlist",
  });
});

test("Kimi runtime uses an empty builtin toolset and preserves proposal-only writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-kimi-runtime-"));
  let agentSpec = "";
  let systemPrompt = "";
  const proposal = {
    id: 41,
    actionKey: "finance.test",
    targetType: "Record",
    diff: { value: 2 },
  };
  const runtime = new KimiAgentRuntime({
    runtimeRoot: root,
    clientFactory: () => fakeClient(
      async (tools) => {
        assert.equal(tools.length, 1);
        assert.match(tools[0].name, /^workspace_/);
        await tools[0].handler({});
      },
      {
        onStart: async (options) => {
          assert.ok(options.agentFile);
          assert.equal(options.model, "kimi-code/kimi-for-coding");
          assert.equal(options.thinking, false);
          [agentSpec, systemPrompt] = await Promise.all([
            readFile(options.agentFile, "utf8"),
            readFile(path.join(path.dirname(options.agentFile), "system.md"), "utf8"),
          ]);
        },
      },
    ) as never,
    resolveToolAccess: async (_user, tools) => ({ tools, capabilities: [] }),
  });

  try {
    const deltas: string[] = [];
    const response = await runtime.runTurn({
      message: "create change",
      execution,
      tools: [toolReturning({ type: "proposal", message: "请确认", proposal }, true)],
      history: [],
      images: [],
      onTextDelta: (delta) => deltas.push(delta),
    });

    assert.equal(response.type, "proposal");
    assert.deepEqual(response.proposal, proposal);
    assert.deepEqual(response.telemetry, {
      inputOtherTokens: null,
      inputCacheReadTokens: null,
      inputCacheCreationTokens: null,
      outputTokens: null,
      contextUsagePeak: null,
      runtimeStepCount: null,
      runtimeOutcome: "finished",
    });
    assert.deepEqual(deltas, ["sdk result"]);
    assert.match(agentSpec, /tools: \[\]/);
    assert.match(agentSpec, /subagents: \{\}/);
    assert.match(systemPrompt, /never contradict it by claiming you cannot perform the capability/);
    assert.match(systemPrompt, /selected runtime's responsibility boundary/);
    assert.match(systemPrompt, /never expand the supplied tools or Platform permissions[\s\S]*implementation details are never clarification questions[\s\S]*never ask the user to paste code or list files[\s\S]*Never call an unrelated domain tool/);
    assert.match(systemPrompt, /Never guess entity, workspace, employee, plan, or relationship IDs/);
    assert.match(systemPrompt, /Do not call a mutating external tool until the user has supplied it/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("QuestionRequest becomes a user clarification and blocks mutating tools for the turn", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-kimi-runtime-"));
  let executeCount = 0;
  let observedAnswers: Record<string, string> = {};
  const mutatingTool: AgentTool = {
    key: "work.item.create",
    label: "Create work item",
    description: "Create a work item proposal",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiredPermissions: [],
    mutates: true,
    execute: async () => {
      executeCount += 1;
      return {
        type: "proposal",
        message: "请确认",
        proposal: { id: 61, actionKey: "work.item.create", targetType: "WorkItem", diff: {} },
      };
    },
  };
  const runtime = new KimiAgentRuntime({
    runtimeRoot: root,
    clientFactory: () => fakeClient(async () => undefined, {
      events: [{
        type: "QuestionRequest",
        payload: {
          id: "question-1",
          tool_call_id: "ask-1",
          questions: [{
            question: "要写入哪个工作空间？",
            header: "工作空间",
            options: [
              { label: "个人空间", description: "写入我的工作" },
              { label: "部门空间" },
            ],
            multi_select: false,
          }],
        },
      }] as StreamEvent[],
      onQuestionResponse: async (requestId, questionRequestId, answers, tools) => {
        assert.equal(requestId, "question-1");
        assert.equal(questionRequestId, "question-1");
        observedAnswers = answers;
        const blocked = await tools[0].handler({});
        assert.match(String(blocked.message), /Wait for the user's clarification/);
      },
    }) as never,
    resolveToolAccess: async (_runtimeExecution, tools) => ({ tools, capabilities: [] }),
  });

  try {
    const response = await runtime.runTurn({
      message: "帮我建一个任务",
      execution,
      tools: [mutatingTool],
      history: [],
      images: [],
    });

    assert.equal(executeCount, 0);
    assert.deepEqual(observedAnswers, { "要写入哪个工作空间？": "等待用户在下一轮确认" });
    assert.equal(response.type, "clarification");
    assert.deepEqual(response.choices, [{
      question: "要写入哪个工作空间？",
      header: "工作空间",
      options: [
        { label: "个人空间", description: "写入我的工作" },
        { label: "部门空间", description: undefined },
      ],
      multiSelect: false,
    }]);
    assert.match(response.message, /工作空间：要写入哪个工作空间/);
    assert.match(response.message, /个人空间（写入我的工作）/);
    assert.match(response.message, /确认完整后我再生成待确认变更/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent runtimes publish isolated complete config snapshots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-kimi-runtime-"));
  const snapshots: Array<{ agentFile: string; agentSpec: string; systemPrompt: string }> = [];
  let started = 0;
  let releaseStarts: () => void = () => undefined;
  const startBarrier = new Promise<void>((resolve) => {
    releaseStarts = resolve;
  });
  const runtimes = Array.from({ length: 3 }, () => new KimiAgentRuntime({
    runtimeRoot: root,
    clientFactory: () => fakeClient(
      async () => undefined,
      {
        onStart: async (options) => {
          assert.ok(options.agentFile);
          started += 1;
          if (started === 3) releaseStarts();
          await startBarrier;
          const [agentSpec, systemPrompt] = await Promise.all([
            readFile(options.agentFile, "utf8"),
            readFile(path.join(path.dirname(options.agentFile), "system.md"), "utf8"),
          ]);
          snapshots.push({ agentFile: options.agentFile, agentSpec, systemPrompt });
        },
      },
    ) as never,
  }));

  try {
    await Promise.all(runtimes.map((runtime) => runtime.runTurn({
      message: "concurrent config read",
      execution,
      tools: [],
      history: [],
      images: [],
    })));

    assert.equal(snapshots.length, 3);
    assert.equal(new Set(snapshots.map(({ agentFile }) => agentFile)).size, 3);
    for (const snapshot of snapshots) {
      assert.match(path.relative(root, snapshot.agentFile), /^turns[/\\][^/\\]+[/\\]config[/\\]agent\.yaml$/);
      assert.match(snapshot.agentSpec, /^version: 1\n/);
      assert.match(snapshot.agentSpec, /subagents: \{\}\n$/);
      assert.match(snapshot.systemPrompt, /^# Workspace internal agent\n/);
      assert.match(snapshot.systemPrompt, /keep operational explanations concise\.\n$/);
      await assert.rejects(readFile(snapshot.agentFile, "utf8"));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Kimi runtime keeps only the last cumulative token snapshot per step", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-kimi-runtime-"));
  const events = [
    { type: "StepBegin", payload: { n: 1 } },
    {
      type: "StatusUpdate",
      payload: {
        token_usage: { input_other: 10, output: 2, input_cache_read: 3, input_cache_creation: 4 },
        context_usage: 0.4,
      },
    },
    {
      type: "StatusUpdate",
      payload: {
        token_usage: { input_other: 12, output: 5, input_cache_read: 4, input_cache_creation: 6 },
        context_usage: 0.6,
      },
    },
    { type: "StepBegin", payload: { n: 2 } },
    {
      type: "StatusUpdate",
      payload: {
        token_usage: { input_other: 7, output: 3, input_cache_read: 2, input_cache_creation: 1 },
        context_usage: 0.5,
      },
    },
    { type: "ContentPart", payload: { type: "text", text: "sdk result" } },
  ] as StreamEvent[];
  const runtime = new KimiAgentRuntime({
    runtimeRoot: root,
    clientFactory: () => fakeClient(async () => undefined, {
      events,
      result: { status: "max_steps_reached", steps: 2 },
    }) as never,
  });

  try {
    const response = await runtime.runTurn({
      message: "summarize",
      execution,
      tools: [],
      history: [],
      images: [],
    });

    assert.equal(response.type, "answer");
    assert.equal(response.message, "sdk result");
    assert.deepEqual(response.telemetry, {
      inputOtherTokens: 19,
      inputCacheReadTokens: 6,
      inputCacheCreationTokens: 7,
      outputTokens: 8,
      contextUsagePeak: 0.6,
      runtimeStepCount: 2,
      runtimeOutcome: "max_steps_reached",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("request abort preserves telemetry already reported by the SDK", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-kimi-runtime-"));
  const controller = new AbortController();
  const proposal = { id: 52, actionKey: "finance.test", targetType: "Record", diff: { value: 2 } };
  const events = [
    { type: "StepBegin", payload: { n: 1 } },
    {
      type: "StatusUpdate",
      payload: {
        token_usage: { input_other: 21, output: 8, input_cache_read: 5, input_cache_creation: 3 },
        context_usage: 0.72,
      },
    },
    { type: "ContentPart", payload: { type: "text", text: "partial" } },
  ] as StreamEvent[];
  const runtime = new KimiAgentRuntime({
    runtimeRoot: root,
    clientFactory: () => fakeClient(async (tools) => {
      await tools[0].handler({});
    }, {
      events,
      result: { status: "finished", steps: 9 },
      hangAfterEvents: true,
    }) as never,
    resolveToolAccess: async (_execution, tools) => ({ tools, capabilities: [] }),
  });

  try {
    await assert.rejects(runtime.runTurn({
      message: "cancel after telemetry",
      execution,
      tools: [toolReturning({ type: "proposal", message: "请确认", proposal }, true)],
      history: [],
      images: [],
      signal: controller.signal,
      onTextDelta: () => controller.abort(new DOMException("request disconnected", "TimeoutError")),
    }), (error) => {
      assert.ok(error instanceof AgentRuntimeAbortError);
      assert.equal(error.name, "AbortError");
      assert.equal(error.kind, "request_cancelled");
      assert.equal(error.message, "request disconnected");
      assert.deepEqual(error.telemetry, {
        inputOtherTokens: 21,
        inputCacheReadTokens: 5,
        inputCacheCreationTokens: 3,
        outputTokens: 8,
        contextUsagePeak: 0.72,
        runtimeStepCount: 1,
        runtimeOutcome: "cancelled",
      });
      assert.equal(error.partialResponse?.type, "proposal");
      assert.equal(error.partialResponse?.toolUsed, "finance.testWrite");
      assert.deepEqual(error.partialResponse?.proposal, proposal);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("internal turn timeout is distinct from request cancellation and keeps partial telemetry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-kimi-runtime-"));
  const runtime = new KimiAgentRuntime({
    runtimeRoot: root,
    maxTurnMs: 100,
    clientFactory: () => fakeClient(async () => undefined, {
      events: [
        { type: "StepBegin", payload: { n: 1 } },
        {
          type: "StatusUpdate",
          payload: {
            token_usage: { input_other: 9, output: 4, input_cache_read: 3, input_cache_creation: 2 },
            context_usage: 0.44,
          },
        },
      ] as StreamEvent[],
      hangAfterEvents: true,
    }) as never,
  });

  try {
    await assert.rejects(runtime.runTurn({
      message: "timeout after telemetry",
      execution,
      tools: [],
      history: [],
      images: [],
    }), (error) => {
      assert.ok(error instanceof AgentRuntimeAbortError);
      assert.equal(error.name, "TimeoutError");
      assert.equal(error.kind, "runtime_timeout");
      assert.equal(error.message, "Agent turn timed out");
      assert.deepEqual(error.telemetry, {
        inputOtherTokens: 9,
        inputCacheReadTokens: 3,
        inputCacheCreationTokens: 2,
        outputTokens: 4,
        contextUsagePeak: 0.44,
        runtimeStepCount: 1,
        runtimeOutcome: "timed_out",
      });
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SDK cancellation error carries partial telemetry without filling missing values", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-kimi-runtime-"));
  const cancellation = Object.assign(new Error("SDK stream cancelled"), { code: "ERR_CANCELED" });
  const runtime = new KimiAgentRuntime({
    runtimeRoot: root,
    clientFactory: () => fakeClient(async () => undefined, {
      events: [
        { type: "StepBegin", payload: { n: 2 } },
        { type: "StatusUpdate", payload: { token_usage: null, context_usage: 0.31 } },
      ] as StreamEvent[],
      eventError: cancellation,
    }) as never,
  });

  try {
    await assert.rejects(runtime.runTurn({
      message: "sdk cancel",
      execution,
      tools: [],
      history: [],
      images: [],
    }), (error) => {
      assert.ok(error instanceof AgentRuntimeAbortError);
      assert.equal(error.message, "SDK stream cancelled");
      assert.deepEqual(error.telemetry, {
        inputOtherTokens: null,
        inputCacheReadTokens: null,
        inputCacheCreationTokens: null,
        outputTokens: null,
        contextUsagePeak: 0.31,
        runtimeStepCount: 2,
        runtimeOutcome: "cancelled",
      });
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mutating Workspace tool is rejected if it does not return a proposal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-kimi-runtime-"));
  const runtime = new KimiAgentRuntime({
    runtimeRoot: root,
    clientFactory: () => fakeClient(async (tools) => {
      await tools[0].handler({});
    }) as never,
    resolveToolAccess: async (_user, tools) => ({ tools, capabilities: [] }),
  });

  try {
    await assert.rejects(runtime.runTurn({
      message: "unsafe write",
      execution,
      tools: [toolReturning({ type: "data", message: "wrong" }, true)],
      history: [],
      images: [],
    }), /未返回 proposal/);
    const directRuntime = new KimiAgentRuntime({
      runtimeRoot: root,
      clientFactory: () => fakeClient(async (tools) => tools[0].handler({}).then(() => undefined)) as never,
      resolveToolAccess: async (_user, tools) => ({ tools, capabilities: [] }),
    });
    const direct = await directRuntime.runTurn({
      message: "direct write",
      execution,
      tools: [toolReturning({ type: "data", message: "done", data: { version: 7 } }, true, "direct")],
      history: [],
      images: [],
    });
    assert.equal(direct.type, "answer");
    assert.deepEqual(direct.data, { version: 7 });
    assert.equal(direct.proposal, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
