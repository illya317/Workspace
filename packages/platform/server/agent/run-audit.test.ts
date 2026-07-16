import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { AGENT_RUNTIME_MAX_TURN_MS } from "./runtime/contracts";
import { AGENT_RUN_MAX_QUEUE_WAIT_MS, AGENT_RUN_RECONCILIATION_GRACE_MS } from "./run-status";

let updateInput: Record<string, unknown> | null = null;
let createInput: Record<string, unknown> | null = null;
mock.module("server-only", { exports: {} } as never);
mock.module("@workspace/platform/server/prisma", {
  exports: {
    prisma: {
      agentRun: {
        create: async (input: Record<string, unknown>) => {
          createInput = input;
          return {};
        },
        updateMany: async (input: Record<string, unknown>) => {
          updateInput = input;
          return { count: 1 };
        },
      },
    },
  },
} as never);
mock.module("./proposal-execution-lease", {
  exports: { reconcileStaleAgentProposalExecutions: async () => ({ count: 0 }) },
} as never);
mock.module("./runtime-snapshot", {
  exports: { buildAgentRuntimeAuditSnapshot: () => ({}) },
} as never);

const { reconcileStaleAgentRuns, startAgentRun } = await import("./run-audit");

test("stale running AgentRun rows are atomically closed before later runs", async () => {
  const now = new Date("2026-07-16T05:00:00.000Z");
  await reconcileStaleAgentRuns(now);
  const cutoff = new Date(
    now.getTime() - AGENT_RUN_MAX_QUEUE_WAIT_MS - AGENT_RUNTIME_MAX_TURN_MS - AGENT_RUN_RECONCILIATION_GRACE_MS,
  );

  assert.deepEqual(updateInput, {
    where: { status: "running", startedAt: { lt: cutoff } },
    data: {
      status: "failed",
      resultType: "error",
      errorMessage: "Agent run exceeded the queue/runtime limit and reconciliation grace; the previous process did not finalize its audit record",
      finishedAt: now,
    },
  });
});

test("personal assistant runs persist Workspace as an immutable runtime fact", async () => {
  createInput = null;
  await startAgentRun({
    requester: { id: 7, username: "requester" },
    actor: { id: 7, username: "requester" },
    profile: null,
  } as never, {
    id: "session-1",
    pagePath: "/work",
  } as never);

  assert.equal(
    (createInput as { data?: { runtimeKind?: string } } | null)?.data?.runtimeKind,
    "workspace",
  );
});
