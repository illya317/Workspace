import assert from "node:assert/strict";
import test, { mock } from "node:test";

type GrantChange = {
  subjectType: "user" | "position" | "department";
  subjectId: number;
  resourceKey: string;
  actionKey: "read" | "submit";
  value: boolean;
};

class MockPermissionGrantMutationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const historyCalls: string[] = [];
const systemConfigWrites: unknown[] = [];
const grantWrites: GrantChange[][] = [];
let permissionDataReads = 0;
let canReadConfig = true;
let canManage = true;
let authorizationMode: "allow" | "deny-second" | "deny-all" = "allow";
let grantWriteError: Error | null = null;
let lastAuthorizationResourceKeys: readonly string[] = [];
let manageableResourceReads = 0;
let authorizationCalls = 0;
const transactionClient = { kind: "transaction" };

const permissionData = {
  subjects: [{
    id: 101,
    name: "测试员工",
    extra: {
      employeeId: "E0101",
      userId: 11,
      hasUser: true,
      department: "研发部",
      position: "工程师",
      canLogin: true,
      isAllResourceAdmin: true,
      positionIds: [22],
    },
  }],
  directActionGrants: [{ subjectId: 101, resourceKey: "finance", actionKey: "read" }],
  positionActionGrants: [{ subjectId: 22, resourceKey: "hr", actionKey: "read" }],
  departmentActionGrants: [{ subjectId: 33, resourceKey: "work", actionKey: "read" }],
  implicitActionGrants: [{ subjectId: 101, resourceKey: "settings", actionKey: "grant" }],
  ancestorResourceKeys: ["agent"],
  childResourceKeys: ["agent.source.child"],
  resourceActions: ["read", "submit"],
  actionRecords: { 101: { actionStates: {}, actionTree: [] } },
  canMutateGrantAction: true,
};

const tx = {
  systemConfig: {
    upsert: async (args: unknown) => {
      systemConfigWrites.push(args);
      return args;
    },
  },
};

mock.module("server-only", { exports: {} } as never);
mock.module("../prisma", {
  exports: { prisma: { $transaction: async (run: (client: typeof tx) => unknown) => run(tx) } },
} as never);
mock.module("../history", {
  exports: {
    ensureEditHistoryBaseline: async (entity: string, id: number, editor: number) => {
      historyCalls.push(`baseline:${entity}:${id}:${editor}`);
    },
    snapshotHistory: async (entity: string, id: number, editor: number) => {
      historyCalls.push(`snapshot:${entity}:${id}:${editor}`);
    },
  },
} as never);
mock.module("../permission-subjects", {
  exports: {
    getPermissionGrantData: async () => {
      permissionDataReads += 1;
      return permissionData;
    },
  },
} as never);
mock.module("../auth/root", {
  exports: {
    isRootAdminUser: async (_userId: number, client?: unknown) => {
      if (client !== transactionClient) throw new Error("mutation root check escaped transaction client");
      return false;
    },
  },
} as never);
mock.module("../rbac/admin-scope", {
  exports: {
    canManageResourceGrant: async () => canManage,
    getManageableResourceKeys: async (_userId: number, client?: unknown) => {
      if (client !== transactionClient) throw new Error("manageable-resource read escaped transaction client");
      manageableResourceReads += 1;
      return new Set(canManage ? ["agent.assistant", "agent.source"] : []);
    },
    manageableResourceKeysAllowGrant: (keys: Set<string>, resourceKey: string) => keys.has(resourceKey),
  },
} as never);
mock.module("../rbac/action-grant-request", {
  exports: {
    authorizePermissionGrantRequest: async (request: GrantChange, options?: { client?: unknown }) => {
      if (options?.client !== transactionClient) throw new Error("mutation authorization escaped transaction client");
      authorizationCalls += 1;
      const deny = authorizationMode === "deny-all"
        || (authorizationMode === "deny-second" && request.subjectId === 22);
      return deny
        ? { ok: false, error: "无权限管理该资源权限", status: 403 }
        : { ok: true, request };
    },
  },
} as never);
mock.module("../rbac/action-grants", {
  exports: {
    PermissionGrantMutationError: MockPermissionGrantMutationError,
    evaluatePermissionAction: async (_userId: number, _resourceKey: string, _actionKey: string, options?: { client?: unknown }) => {
      if (options?.client && options.client !== transactionClient) {
        throw new Error("mutation read check escaped transaction client");
      }
      return canReadConfig;
    },
    setSubjectPermissionActionGrants: async (
      changes: GrantChange[],
      options?: { authorizationResourceKeys?: readonly string[]; beforeMutation?: (tx: unknown) => Promise<void> },
    ) => {
      lastAuthorizationResourceKeys = options?.authorizationResourceKeys ?? [];
      await options?.beforeMutation?.(transactionClient);
      if (grantWriteError) throw grantWriteError;
      grantWrites.push(changes);
      return changes.map(() => ({ changed: true }));
    },
  },
} as never);
mock.module("./permission-resource-directory", {
  exports: {
    listRegisteredAgentCapabilityKeys: () => ["agent.assistant", "agent.source"],
  },
} as never);

const {
  buildAgentPermissionGrantBatchCommand,
  executeAgentActionCeilingUpdateCommand,
  executeAgentPermissionGrantBatchCommand,
  getAgentPermissionGrantDataForActor,
} = await import("./permission-management-service");

function command(changes: GrantChange[]) {
  return { actorUserId: 7, changes };
}

test("action ceiling write records one logical Agent policy history stream", async () => {
  historyCalls.length = 0;
  systemConfigWrites.length = 0;
  const result = await executeAgentActionCeilingUpdateCommand({
    editorUserId: 7,
    actionKeys: ["read", "submit"],
  });
  assert.equal(result.ok, true);
  assert.equal(systemConfigWrites.length, 1);
  assert.deepEqual(historyCalls, [
    "baseline:AgentPermissionPolicy:1:7",
    "snapshot:AgentPermissionPolicy:1:7",
  ]);
});

test("grant directory requires the selected resource real grant authority", async () => {
  permissionDataReads = 0;
  canReadConfig = true;
  canManage = false;
  const denied = await getAgentPermissionGrantDataForActor({
    actorUserId: 7,
    subjectType: "department",
    resourceKey: "agent.source",
  });
  assert.equal(denied.ok, false);
  assert.equal(permissionDataReads, 0);

  canManage = true;
  const allowed = await getAgentPermissionGrantDataForActor({
    actorUserId: 7,
    subjectType: "user",
    resourceKey: "agent.source",
  });
  assert.equal(allowed.ok, true);
  assert.equal(permissionDataReads, 1);
  if (allowed.ok) {
    assert.deepEqual(Object.keys(allowed.data).sort(), [
      "actionRecords",
      "canMutateGrantAction",
      "resourceActions",
      "subjects",
    ]);
    assert.deepEqual(allowed.data.subjects, [{
      id: 101,
      name: "测试员工",
      extra: {
        employeeId: "E0101",
        userId: 11,
        hasUser: true,
        department: "研发部",
        position: "工程师",
      },
    }]);
    assert.equal("directActionGrants" in allowed.data, false);
    assert.equal("canLogin" in (allowed.data.subjects[0]?.extra ?? {}), false);
    assert.equal("positionIds" in (allowed.data.subjects[0]?.extra ?? {}), false);
  }
});

test("agent.config.read is required before grant directory or mutation authorization", async () => {
  permissionDataReads = 0;
  grantWrites.length = 0;
  canReadConfig = false;
  canManage = true;
  authorizationMode = "allow";

  const read = await getAgentPermissionGrantDataForActor({
    actorUserId: 7,
    subjectType: "user",
    resourceKey: "agent.source",
  });
  const write = await executeAgentPermissionGrantBatchCommand(command([
    { subjectType: "user", subjectId: 11, resourceKey: "agent.source", actionKey: "read", value: true },
  ]));

  assert.equal(read.ok, false);
  if (!read.ok) assert.equal(read.status, 403);
  assert.equal(write.ok, false);
  if (!write.ok) assert.equal(write.status, 403);
  assert.equal(permissionDataReads, 0);
  assert.equal(grantWrites.length, 0);
  assert.deepEqual(lastAuthorizationResourceKeys, ["agent.config", "agent.source"]);
  canReadConfig = true;
});

test("configure-only authority cannot bypass grant authorization", async () => {
  grantWrites.length = 0;
  canReadConfig = true;
  canManage = false;
  authorizationMode = "allow";
  const result = await executeAgentPermissionGrantBatchCommand(command([
    { subjectType: "user", subjectId: 11, resourceKey: "agent.assistant", actionKey: "read", value: true },
  ]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
  assert.equal(grantWrites.length, 0);
  canManage = true;
});

test("one denied item rejects the complete grant batch before mutation", async () => {
  grantWrites.length = 0;
  canReadConfig = true;
  authorizationMode = "deny-second";
  const result = await executeAgentPermissionGrantBatchCommand(command([
    { subjectType: "user", subjectId: 11, resourceKey: "agent.assistant", actionKey: "read", value: true },
    { subjectType: "position", subjectId: 22, resourceKey: "agent.source", actionKey: "submit", value: true },
  ]));
  assert.equal(result.ok, false);
  assert.equal(grantWrites.length, 0);
});

test("grant-authorized batch writes all three canonical subject types", async () => {
  grantWrites.length = 0;
  canReadConfig = true;
  authorizationMode = "allow";
  grantWriteError = null;
  const changes: GrantChange[] = [
    { subjectType: "user", subjectId: 11, resourceKey: "agent.assistant", actionKey: "read", value: true },
    { subjectType: "position", subjectId: 22, resourceKey: "agent.source", actionKey: "submit", value: true },
    { subjectType: "department", subjectId: 33, resourceKey: "agent.source", actionKey: "read", value: true },
  ];
  const built = buildAgentPermissionGrantBatchCommand({ actorUserId: 7, request: { changes } });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const result = await executeAgentPermissionGrantBatchCommand(built.data);
  assert.equal(result.ok, true);
  assert.deepEqual(grantWrites[0]?.map((change) => change.subjectType), ["user", "position", "department"]);
});

test("a 100-change lock-time batch loads manageable resources once but statically validates every item", async () => {
  grantWrites.length = 0;
  manageableResourceReads = 0;
  authorizationCalls = 0;
  canReadConfig = true;
  canManage = true;
  authorizationMode = "allow";
  grantWriteError = null;
  const changes: GrantChange[] = Array.from({ length: 100 }, (_, index) => ({
    subjectType: "user" as const,
    subjectId: index + 1,
    resourceKey: "agent.source",
    actionKey: index % 2 === 0 ? "read" as const : "submit" as const,
    value: true,
  }));

  const result = await executeAgentPermissionGrantBatchCommand(command(changes));
  assert.equal(result.ok, true);
  assert.equal(manageableResourceReads, 1);
  assert.equal(authorizationCalls, 100);
  assert.equal(grantWrites[0]?.length, 100);
});

test("known grant constraints map to 400 while infrastructure failures remain 500 candidates", async () => {
  canReadConfig = true;
  authorizationMode = "allow";
  grantWriteError = new MockPermissionGrantMutationError("已知约束");
  const known = await executeAgentPermissionGrantBatchCommand(command([
    { subjectType: "user", subjectId: 11, resourceKey: "agent.assistant", actionKey: "read", value: true },
  ]));
  assert.equal(known.ok, false);
  if (!known.ok) assert.equal(known.status, 400);

  grantWriteError = new Error("database unavailable");
  await assert.rejects(
    executeAgentPermissionGrantBatchCommand(command([
      { subjectType: "user", subjectId: 11, resourceKey: "agent.assistant", actionKey: "read", value: true },
    ])),
    /database unavailable/,
  );
  grantWriteError = null;
});
