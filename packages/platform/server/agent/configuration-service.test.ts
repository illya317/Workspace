import assert from "node:assert/strict";
import test, { mock } from "node:test";

type WriteArgs = { where: { id: number }; data: Record<string, unknown>; select: Record<string, boolean> };

const historyCalls: string[] = [];
let profileWrite: WriteArgs | null = null;
let runtimeWrite: WriteArgs | null = null;
let currentRuntimeProfileId = 7;

const tx = {
  agentProfile: {
    findUnique: async () => ({ id: 7 }),
    update: async (args: WriteArgs) => {
      profileWrite = args;
      return {
        id: 7,
        displayName: args.data.displayName,
        roleName: args.data.roleName,
        responsibilities: args.data.responsibilities,
        status: args.data.status,
        updatedAt: new Date("2026-07-16T07:00:00.000Z"),
      };
    },
  },
  agentRuntimeBinding: {
    findUnique: async () => ({ id: 11, agentProfileId: currentRuntimeProfileId, runtimeKind: "workspace" }),
    update: async (args: WriteArgs) => {
      runtimeWrite = args;
      return {
        id: 11,
        status: args.data.status,
        interactive: args.data.interactive,
        instructions: args.data.instructions,
        updatedAt: new Date("2026-07-16T07:01:00.000Z"),
      };
    },
  },
};

mock.module("server-only", { namedExports: {} } as never);
mock.module("@workspace/platform/server/prisma", {
  namedExports: { prisma: { $transaction: async (run: (client: typeof tx) => unknown) => run(tx) } },
} as never);
mock.module("@workspace/platform/server/history", {
  namedExports: {
    ensureEditHistoryBaseline: async (entityType: string, id: number, editorId: number) => {
      historyCalls.push(`baseline:${entityType}:${id}:${editorId}`);
    },
    snapshotHistory: async (entityType: string, id: number, editorId: number) => {
      historyCalls.push(`snapshot:${entityType}:${id}:${editorId}`);
    },
  },
} as never);
mock.module("./configuration-capabilities", {
  namedExports: { listConfigurableWorkspaceCapabilities: async () => [] },
} as never);

const { executeAgentConfigurationUpdateCommand } = await import("./configuration-service");

test("configuration service writes only mutable fields and records both history streams", async () => {
  historyCalls.length = 0;
  profileWrite = null;
  runtimeWrite = null;
  currentRuntimeProfileId = 7;

  const result = await executeAgentConfigurationUpdateCommand({
    editorUserId: 3,
    profileId: 7,
    profile: {
      displayName: "研发架构 Agent",
      roleName: "研发架构",
      responsibilities: "审查代码并提交 PR。",
      status: "active",
    },
    runtime: {
      id: 11,
      runtimeKind: "workspace",
      status: "active",
      interactive: true,
      instructions: "Use registered tools only.",
      capabilityKeys: ["source.search"],
    },
  });

  const savedProfileWrite = profileWrite as WriteArgs | null;
  const savedRuntimeWrite = runtimeWrite as WriteArgs | null;
  assert.equal(result.ok, true);
  assert.deepEqual(savedProfileWrite?.data, {
    displayName: "研发架构 Agent",
    roleName: "研发架构",
    responsibilities: "审查代码并提交 PR。",
    status: "active",
    editedBy: 3,
  });
  assert.deepEqual(savedRuntimeWrite?.data, {
    status: "active",
    interactive: true,
    instructions: "Use registered tools only.",
    capabilityKeysJson: '["source.search"]',
    editedBy: 3,
  });
  assert.equal("actorUserId" in (savedProfileWrite?.data ?? {}), false);
  assert.equal("key" in (savedProfileWrite?.data ?? {}), false);
  assert.equal("runtimeKind" in (savedRuntimeWrite?.data ?? {}), false);
  assert.deepEqual(historyCalls, [
    "baseline:AgentProfile:7:3",
    "snapshot:AgentProfile:7:3",
    "baseline:AgentRuntimeBinding:11:3",
    "snapshot:AgentRuntimeBinding:11:3",
  ]);
  if (result.ok) assert.deepEqual(result.data.runtime?.capabilityKeys, ["source.search"]);
});

test("stale runtime association aborts before any profile or runtime write", async () => {
  historyCalls.length = 0;
  profileWrite = null;
  runtimeWrite = null;
  currentRuntimeProfileId = 99;

  const result = await executeAgentConfigurationUpdateCommand({
    editorUserId: 3,
    profileId: 7,
    profile: {
      displayName: "Should not persist",
      roleName: "Should not persist",
      responsibilities: "Should not persist",
      status: "active",
    },
    runtime: {
      id: 11,
      runtimeKind: "workspace",
      status: "active",
      interactive: true,
      instructions: "Should not persist",
      capabilityKeys: [],
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
  assert.equal(profileWrite, null);
  assert.equal(runtimeWrite, null);
  assert.deepEqual(historyCalls, []);
});
