import assert from "node:assert/strict";
import test, { mock } from "node:test";

type SubjectType = "user" | "position" | "department";
type GrantRow = { subjectType: SubjectType; subjectId: number; actionKey: string };
type SqlFragment = { strings: string[]; values: unknown[] };
type Operation = {
  txId: number;
  type: "lock" | "subject" | "root" | "resource" | "callback" | "find" | "create";
  key: string;
};

let transactionCount = 0;
let missingResources = false;
let missingSubjects = false;
let lockFailure: Error | null = null;
const writes: GrantRow[] = [];
const ledgerEvents: Array<Record<string, unknown>> = [];
const grantCounts = new Map<string, number>();
const lockTails = new Map<string, Promise<void>>();
const lockQueries: SqlFragment[] = [];
const operations: Operation[] = [];

function tupleKey(subjectType: SubjectType, subjectId: number, resourceId: number, actionKey: string, scopeId: unknown) {
  return `${subjectType}:${subjectId}:${resourceId}:${actionKey}:${scopeId ?? "<global>"}`;
}

function resetState() {
  transactionCount = 0;
  missingResources = false;
  missingSubjects = false;
  lockFailure = null;
  writes.length = 0;
  ledgerEvents.length = 0;
  grantCounts.clear();
  lockTails.clear();
  lockQueries.length = 0;
  operations.length = 0;
}

async function acquireFakeTransactionLock(key: string, releases: Array<() => void>) {
  const previous = lockTails.get(key) ?? Promise.resolve();
  let releaseHold: () => void = () => {};
  const hold = new Promise<void>((resolve) => { releaseHold = resolve; });
  const tail = previous.then(() => hold);
  lockTails.set(key, tail);
  await previous;
  releases.push(() => {
    releaseHold();
    if (lockTails.get(key) === tail) {
      void tail.then(() => {
        if (lockTails.get(key) === tail) lockTails.delete(key);
      });
    }
  });
}

function grantDelegate(subjectType: SubjectType, subjectIdKey: string, txId: number) {
  return {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const key = tupleKey(
        subjectType,
        Number(where[subjectIdKey]),
        Number(where.resourceId),
        String(where.actionKey),
        where.scopeId,
      );
      operations.push({ txId, type: "find", key });
      await Promise.resolve();
      return (grantCounts.get(key) ?? 0) > 0 ? { id: 1 } : null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const key = tupleKey(
        subjectType,
        Number(data[subjectIdKey]),
        Number(data.resourceId),
        String(data.actionKey),
        data.scopeId,
      );
      operations.push({ txId, type: "create", key });
      grantCounts.set(key, (grantCounts.get(key) ?? 0) + 1);
      writes.push({
        subjectType,
        subjectId: Number(data[subjectIdKey]),
        actionKey: String(data.actionKey),
      });
      return data;
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const key = tupleKey(
        subjectType,
        Number(where[subjectIdKey]),
        Number(where.resourceId),
        String(where.actionKey),
        where.scopeId,
      );
      const count = grantCounts.get(key) ?? 0;
      grantCounts.delete(key);
      return { count };
    },
  };
}

function transactionClient(txId: number, releases: Array<() => void>) {
  return {
    __txId: txId,
    user: {
      findMany: async ({ where }: { where: { id: { in: number[] } } }) => {
        operations.push({ txId, type: "subject", key: `user:${where.id.in.join(",")}` });
        return missingSubjects ? [] : where.id.in.map((id) => ({
          id,
          username: id === 999 ? "admin" : `user-${id}`,
          canLogin: true,
        }));
      },
    },
    position: {
      findMany: async ({ where }: { where: { id: { in: number[] } } }) => {
        operations.push({ txId, type: "subject", key: `position:${where.id.in.join(",")}` });
        return missingSubjects ? [] : where.id.in.map((id) => ({ id }));
      },
    },
    department: {
      findMany: async ({ where }: { where: { id: { in: number[] } } }) => {
        operations.push({ txId, type: "subject", key: `department:${where.id.in.join(",")}` });
        return missingSubjects ? [] : where.id.in.map((id) => ({ id }));
      },
    },
    resource: {
      findMany: async ({ where }: { where: { key: { in: string[] } } }) => {
        operations.push({ txId, type: "resource", key: where.key.in.join(",") });
        return missingResources
          ? []
          : where.key.in.map((key) => ({ id: resourceIdByKey[key] ?? 99, key, name: key }));
      },
    },
    userResourceActionGrant: grantDelegate("user", "userId", txId),
    positionResourceActionGrant: grantDelegate("position", "positionId", txId),
    departmentResourceActionGrant: grantDelegate("department", "departmentId", txId),
    $queryRaw: async (query: SqlFragment) => {
      lockQueries.push(query);
      if (lockFailure) throw lockFailure;
      const key = String(query.values[0]);
      await acquireFakeTransactionLock(key, releases);
      operations.push({ txId, type: "lock", key });
      return [{ pg_advisory_xact_lock: null }];
    },
  };
}

const resourceIdByKey: Record<string, number> = {
  "agent.assistant": 1,
  "agent.source": 2,
};

mock.module("@workspace/platform/permission-action-grantability", {
  exports: {
    isPermissionActionGrantable: () => true,
    permissionGrantContributesToAction: () => false,
  },
} as never);
mock.module("@workspace/platform/permission-resource-policy", {
  exports: {
    canPermissionActionInheritFromAncestor: () => false,
    canPermissionResourceInheritGlobalScope: () => false,
    isPermissionActionSupported: () => true,
  },
} as never);
mock.module("@workspace/platform/server/prisma", {
  exports: {
    Prisma: {
      sql: (strings: TemplateStringsArray, ...values: unknown[]): SqlFragment => ({
        strings: [...strings],
        values,
      }),
    },
    prisma: {
      resource: { findMany: async () => { throw new Error("global resource client used"); } },
      user: { findMany: async () => { throw new Error("global user client used"); } },
      position: { findMany: async () => { throw new Error("global position client used"); } },
      department: { findMany: async () => { throw new Error("global department client used"); } },
      $transaction: async (run: (client: ReturnType<typeof transactionClient>) => unknown) => {
        transactionCount += 1;
        const txId = transactionCount;
        const releases: Array<() => void> = [];
        try {
          return await run(transactionClient(txId, releases));
        } finally {
          for (const release of releases.reverse()) release();
        }
      },
    },
  },
} as never);
mock.module("../auth/root", {
  exports: {
    isRootAdminUsername: (username: string | null | undefined) => username === "admin",
    isRootAdminUser: async (_userId: number, client: { __txId?: number }) => {
      if (!client?.__txId) throw new Error("global root client used");
      operations.push({ txId: client.__txId, type: "root", key: String(_userId) });
      return false;
    },
  },
} as never);
mock.module("./permission-grant-ledger", {
  exports: {
    recordPermissionGrantLedgerEvent: async (event: Record<string, unknown>) => {
      ledgerEvents.push(event);
      return { id: ledgerEvents.length };
    },
  },
} as never);

const {
  PermissionGrantMutationError,
  setSubjectPermissionActionGrant,
  setSubjectPermissionActionGrants,
} = await import("./action-grants");

test("batch grant rejects missing resources after locks and before mutation", async () => {
  resetState();
  missingResources = true;
  await assert.rejects(
    setSubjectPermissionActionGrants([
      { subjectType: "department", subjectId: 9, resourceKey: "agent.source", actionKey: "read", value: true },
    ]),
    PermissionGrantMutationError,
  );
  assert.equal(transactionCount, 1);
  assert.equal(writes.length, 0);
  assert.ok(operations.some((operation) => operation.type === "lock"));
});

test("one missing subject rejects the complete batch after locks and before resource/mutation reads", async () => {
  resetState();
  missingSubjects = true;
  await assert.rejects(
    setSubjectPermissionActionGrants([
      { subjectType: "user", subjectId: 1, resourceKey: "agent.assistant", actionKey: "read", value: true },
      { subjectType: "department", subjectId: 404, resourceKey: "agent.source", actionKey: "read", value: false },
    ]),
    /授权主体不存在/,
  );
  assert.equal(transactionCount, 1);
  assert.equal(writes.length, 0);
  assert.equal(operations.some((operation) => operation.type === "resource"), false);
});

test("one batched subject query rejects a root target without per-user root reads", async () => {
  resetState();
  await assert.rejects(
    setSubjectPermissionActionGrants([
      { subjectType: "user", subjectId: 999, resourceKey: "agent.source", actionKey: "read", value: true },
      ...Array.from({ length: 100 }, (_, index) => ({
        subjectType: "user" as const,
        subjectId: 1_000 + index,
        resourceKey: "agent.source",
        actionKey: "read" as const,
        value: true,
      })),
    ]),
    /内置 admin 账号不参与 RBAC 授权/,
  );

  assert.equal(operations.filter((operation) => operation.type === "subject").length, 1);
  assert.equal(operations.filter((operation) => operation.type === "root").length, 0);
  assert.equal(operations.some((operation) => operation.type === "resource"), false);
  assert.equal(writes.length, 0);
  assert.equal(ledgerEvents.length, 0);
});

test("batch locks authorization domains and parameterized tuples before tx-only preflight and one ledger transaction", async () => {
  resetState();
  const results = await setSubjectPermissionActionGrants([
    { subjectType: "user", subjectId: 1, resourceKey: "agent.assistant", actionKey: "read", value: true },
    { subjectType: "position", subjectId: 2, resourceKey: "agent.source", actionKey: "submit", value: true },
    { subjectType: "department", subjectId: 3, resourceKey: "agent.source", actionKey: "read", value: true },
  ], {
    actorUserId: 7,
    batchId: "batch-1",
  });

  assert.equal(transactionCount, 1);
  assert.deepEqual(writes.map((write) => write.subjectType), ["user", "position", "department"]);
  assert.equal(results.every((result) => result.changed), true);
  assert.deepEqual(ledgerEvents.map((event) => event.batchId), ["batch-1", "batch-1", "batch-1"]);
  const txOperations = operations.filter((operation) => operation.txId === 1);
  const lockKeys = txOperations.filter((operation) => operation.type === "lock").map((operation) => operation.key);
  const domainKeys = lockKeys.filter((key) => key.startsWith("permission-action-grant-domain-v1:"));
  const tupleKeys = lockKeys.filter((key) => key.startsWith("permission-action-grant-tuple-v1:"));
  assert.deepEqual(domainKeys, [...domainKeys].sort());
  assert.deepEqual(tupleKeys, [...tupleKeys].sort());
  assert.ok(domainKeys.includes("permission-action-grant-domain-v1:agent.source"));
  assert.ok(domainKeys.includes("permission-action-grant-domain-v1:agent.assistant"));
  assert.ok(domainKeys.includes("permission-action-grant-domain-v1:settings.account"));
  const firstPostLock = txOperations.findIndex((operation) => operation.type !== "lock");
  assert.ok(txOperations.findLastIndex((operation) => operation.type === "lock") < firstPostLock);
  assert.equal(lockQueries.every((query) => query.values.length === 1), true);
  assert.equal(lockQueries.some((query) => query.strings.join("").includes("agent.source")), false);
});

test("concurrent single grants for one global tuple create one row and one ledger event", async () => {
  resetState();
  const results = await Promise.all([
    setSubjectPermissionActionGrant("user", 1, "agent.source", "read", true, { actorUserId: 7 }),
    setSubjectPermissionActionGrant("user", 1, "agent.source", "read", true, { actorUserId: 7 }),
  ]);

  assert.deepEqual(results.map((result) => result.changed).sort(), [false, true]);
  assert.deepEqual([...grantCounts.values()], [1]);
  assert.equal(ledgerEvents.length, 1);
  assert.equal(transactionCount, 2);
});

test("concurrent reverse-order batches do not deadlock or duplicate global rows and ledger events", async () => {
  resetState();
  const first = [
    { subjectType: "user" as const, subjectId: 1, resourceKey: "agent.assistant", actionKey: "read" as const, value: true },
    { subjectType: "position" as const, subjectId: 2, resourceKey: "agent.source", actionKey: "submit" as const, value: true },
  ];
  const second = [...first].reverse();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const results = await Promise.race([
      Promise.all([
        setSubjectPermissionActionGrants(first, { actorUserId: 7 }),
        setSubjectPermissionActionGrants(second, { actorUserId: 7 }),
      ]),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("reverse-order batches deadlocked")), 500);
      }),
    ]);
    assert.equal(results.flat().filter((result) => result.changed).length, 2);
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  assert.deepEqual([...grantCounts.values()].sort(), [1, 1]);
  assert.equal(ledgerEvents.length, 2);
  for (const txId of [1, 2]) {
    const lockKeys = operations
      .filter((operation) => operation.txId === txId && operation.type === "lock")
      .map((operation) => operation.key);
    assert.deepEqual(lockKeys, [...lockKeys].sort());
  }
});

test("owner-domain revoke wins before the locked authorization callback and blocks target mutation", async () => {
  resetState();
  const actorGrantKey = tupleKey("user", 7, 1, "grant", null);
  const targetGrantKey = tupleKey("user", 9, 2, "read", null);
  grantCounts.set(actorGrantKey, 1);

  const revoke = setSubjectPermissionActionGrant(
    "user",
    7,
    "agent.assistant",
    "grant",
    false,
    { actorUserId: 99 },
  );
  await Promise.resolve();
  const target = setSubjectPermissionActionGrants([
    { subjectType: "user", subjectId: 9, resourceKey: "agent.source", actionKey: "read", value: true },
  ], {
    actorUserId: 7,
    authorizationResourceKeys: ["agent.source"],
    beforeMutation: async (tx) => {
      operations.push({ txId: Number((tx as unknown as { __txId: number }).__txId), type: "callback", key: "agent.source" });
      if ((grantCounts.get(actorGrantKey) ?? 0) === 0) {
        throw new PermissionGrantMutationError("actor grant revoked", 403);
      }
    },
  });
  const [revokeResult, targetResult] = await Promise.allSettled([revoke, target]);

  assert.equal(revokeResult.status, "fulfilled");
  assert.equal(targetResult.status, "rejected");
  if (targetResult.status === "rejected") assert.match(String(targetResult.reason), /actor grant revoked/);
  assert.equal(grantCounts.get(actorGrantKey) ?? 0, 0);
  assert.equal(grantCounts.get(targetGrantKey) ?? 0, 0);
  assert.equal(ledgerEvents.length, 1);
  const targetTxOperations = operations.filter((operation) => operation.txId === 2);
  assert.ok(targetTxOperations.findLastIndex((operation) => operation.type === "lock") < targetTxOperations.findIndex((operation) => operation.type === "callback"));
  assert.equal(targetTxOperations.some((operation) => operation.type === "find" || operation.type === "create"), false);
});

test("agent.assistant domain revoke wins before source-grant revalidation", async () => {
  resetState();
  const baseReadKey = tupleKey("user", 7, 1, "read", null);
  const targetGrantKey = tupleKey("user", 9, 2, "read", null);
  grantCounts.set(baseReadKey, 1);

  const revoke = setSubjectPermissionActionGrant(
    "user",
    7,
    "agent.assistant",
    "read",
    false,
    { actorUserId: 99 },
  );
  await Promise.resolve();
  const target = setSubjectPermissionActionGrants([
    { subjectType: "user", subjectId: 9, resourceKey: "agent.source", actionKey: "read", value: true },
  ], {
    actorUserId: 7,
    authorizationResourceKeys: ["agent.assistant", "agent.source"],
    beforeMutation: async () => {
      if ((grantCounts.get(baseReadKey) ?? 0) === 0) {
        throw new PermissionGrantMutationError("agent.assistant.read revoked", 403);
      }
    },
  });
  const [revokeResult, targetResult] = await Promise.allSettled([revoke, target]);

  assert.equal(revokeResult.status, "fulfilled");
  assert.equal(targetResult.status, "rejected");
  if (targetResult.status === "rejected") assert.match(String(targetResult.reason), /agent\.assistant\.read revoked/);
  assert.equal(grantCounts.get(baseReadKey) ?? 0, 0);
  assert.equal(grantCounts.get(targetGrantKey) ?? 0, 0);
  assert.equal(ledgerEvents.length, 1);
});

test("callback denial occurs after tx-only preflight and leaves target rows and ledger untouched", async () => {
  resetState();
  await assert.rejects(
    setSubjectPermissionActionGrants([
      { subjectType: "user", subjectId: 9, resourceKey: "agent.source", actionKey: "read", value: true },
    ], {
      authorizationResourceKeys: ["agent.assistant", "agent.source"],
      beforeMutation: async (tx) => {
        operations.push({ txId: Number((tx as unknown as { __txId: number }).__txId), type: "callback", key: "agent.assistant" });
        throw new PermissionGrantMutationError("base read revoked", 403);
      },
    }),
    /base read revoked/,
  );

  assert.equal(writes.length, 0);
  assert.equal(ledgerEvents.length, 0);
  const txOperations = operations.filter((operation) => operation.txId === 1);
  assert.ok(txOperations.some((operation) => operation.type === "subject"));
  assert.equal(txOperations.some((operation) => operation.type === "root"), false);
  assert.ok(txOperations.some((operation) => operation.type === "resource"));
  assert.ok(txOperations.some((operation) => operation.type === "callback"));
  assert.equal(txOperations.some((operation) => operation.type === "find" || operation.type === "create"), false);
  assert.ok(txOperations.some((operation) => operation.key === "permission-action-grant-domain-v1:agent.assistant"));
  assert.ok(txOperations.some((operation) => operation.key === "permission-action-grant-domain-v1:settings.account"));
});

test("unknown advisory-lock database failures propagate without mutation or ledger claims", async () => {
  resetState();
  lockFailure = new Error("database lock unavailable");
  await assert.rejects(
    setSubjectPermissionActionGrant("user", 1, "agent.source", "read", true, { actorUserId: 7 }),
    /database lock unavailable/,
  );
  assert.equal(writes.length, 0);
  assert.equal(ledgerEvents.length, 0);
});
