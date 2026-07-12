import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ProtocolClient, type ExternalTool, type StreamEvent } from "@moonshot-ai/kimi-agent-sdk";
import type { SessionUser } from "@workspace/platform/types";

import type { AgentTool } from "../tools";
import { createKimiToolGuard, KimiAgentRuntime } from "./kimi-runtime";

const user: SessionUser = { id: 7, username: "runtime-test" };

function fakeClient(onPrompt: (tools: ExternalTool[]) => Promise<void>) {
  let externalTools: ExternalTool[] = [];
  const client = {
    async start(options: Parameters<ProtocolClient["start"]>[0]) {
      externalTools = options.externalTools ?? [];
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
        yield { type: "ContentPart", payload: { type: "text", text: "sdk result" } } as StreamEvent;
      })();
      return { events, result: Promise.resolve({ status: "finished" as const }) };
    },
    async sendCancel() {},
    async sendApproval() {},
    async sendQuestionResponse() {},
  };
  return client;
}

function toolReturning(result: Awaited<ReturnType<AgentTool["execute"]>>, mutates: boolean): AgentTool {
  return {
    key: "finance.testWrite",
    label: "Test write",
    description: "Create a deterministic test proposal",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiredPermissions: [],
    mutates,
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
  const proposal = {
    id: 41,
    actionKey: "finance.test",
    targetType: "Record",
    diff: { value: 2 },
  };
  const runtime = new KimiAgentRuntime({
    runtimeRoot: root,
    clientFactory: () => fakeClient(async (tools) => {
      assert.equal(tools.length, 1);
      assert.match(tools[0].name, /^workspace_/);
      await tools[0].handler({});
    }) as never,
    resolveToolAccess: async (_user, tools) => ({ tools, capabilities: [] }),
  });

  try {
    const response = await runtime.runTurn({
      message: "create change",
      user,
      tools: [toolReturning({ type: "proposal", message: "请确认", proposal }, true)],
      history: [],
      images: [],
    });

    assert.equal(response.type, "proposal");
    assert.deepEqual(response.proposal, proposal);
    const agentSpec = await readFile(path.join(root, "config", "agent.yaml"), "utf8");
    assert.match(agentSpec, /tools: \[\]/);
    assert.match(agentSpec, /subagents: \{\}/);
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
      user,
      tools: [toolReturning({ type: "data", message: "wrong" }, true)],
      history: [],
      images: [],
    }), /未返回 proposal/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
