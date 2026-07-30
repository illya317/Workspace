import assert from "node:assert/strict";
import test from "node:test";

import {
  RelationPolicyConfigConflictError,
  normalizeRelationPolicySettings,
  normalizeStoredRelationPolicySettings,
  relationPolicyAdvisoryLockKey,
  readRelationPolicyConfig,
  resetRelationPolicyConfig,
  writeRelationPolicyConfig,
  type RelationPolicyReadStore,
  type RelationPolicyTransactionStore,
  type RelationPolicyWriteStore,
} from "./relation-policy-config";

type ConfigRow = NonNullable<Awaited<ReturnType<
  RelationPolicyReadStore["relationPolicyConfig"]["findUnique"]
>>>;

interface RevisionRow {
  policyKey: string;
  version: number;
  changeKind: "upsert" | "reset";
  reason: string;
  settingsJson: unknown;
  baselineHash: string;
  actorUserId: number;
}

function mockClient() {
  const configs = new Map<string, ConfigRow>();
  const revisions: RevisionRow[] = [];
  const events: string[] = [];
  let tick = 0;
  const nextDate = () => new Date(Date.UTC(2026, 6, 30, 0, 0, tick++));

  const transaction: RelationPolicyTransactionStore = {
    async $queryRaw<T = unknown>(query: Parameters<RelationPolicyTransactionStore["$queryRaw"]>[0]) {
      events.push(`lock:${String(query.values[0])}`);
      return [] as T;
    },
    relationPolicyConfig: {
      async findUnique({ where }) {
        return configs.get(where.policyKey) ?? null;
      },
      async findMany() {
        return [...configs.values()].sort((left, right) => left.policyKey.localeCompare(right.policyKey));
      },
      async create({ data }) {
        events.push("create");
        if (configs.has(data.policyKey)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
        const now = nextDate();
        const row: ConfigRow = {
          ...data,
          createdAt: now,
          updatedAt: now,
        };
        configs.set(row.policyKey, row);
        return row;
      },
      async updateMany({ where, data }) {
        events.push("update");
        const current = configs.get(where.policyKey);
        if (!current || current.version !== where.version) return { count: 0 };
        configs.set(where.policyKey, {
          ...current,
          settingsJson: data.settingsJson,
          baselineHash: data.baselineHash,
          version: current.version + data.version.increment,
          updatedByUserId: data.updatedByUserId,
          updatedAt: nextDate(),
        });
        return { count: 1 };
      },
    },
    relationPolicyRevision: {
      async create({ data }) {
        events.push("revision");
        revisions.push(data);
        return data;
      },
    },
  };
  const client: RelationPolicyWriteStore = {
    relationPolicyConfig: transaction.relationPolicyConfig,
    async $transaction(action) {
      return action(transaction);
    },
  };
  return { client, configs, revisions, events };
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

test("new writes accept only targetDelete and relation-keyed business required policies", () => {
  assert.deepEqual(normalizeRelationPolicySettings({
    targetDelete: "block",
    businessRequiredByRelation: {
      "administration.contracts.owner.department": "required",
    },
  }), {
    targetDelete: "block",
    businessRequiredByRelation: {
      "administration.contracts.owner.department": "required",
    },
  });
  assert.deepEqual(normalizeStoredRelationPolicySettings({
    targetArchive: "block",
    sourceRelationChange: "confirm_unlink",
  }), {
    targetArchive: "block",
    sourceRelationChange: "confirm_unlink",
  });
  assert.throws(
    () => normalizeRelationPolicySettings({ targetDelete: "delete_everything" }),
    /targetDelete 无效/,
  );
  assert.throws(
    () => normalizeRelationPolicySettings({ targetArchive: "block" }),
    /新写配置包含未知字段：targetArchive/,
  );
  assert.throws(
    () => normalizeRelationPolicySettings({ businessRequiredByRelation: { "test.relation": "sometimes" } }),
    /业务必填策略无效/,
  );
  assert.throws(() => normalizeRelationPolicySettings(null), /必须是对象/);
});

test("creates, updates, reads, and resets with append-only revisions", async () => {
  const { client, configs, revisions } = mockClient();
  const created = await writeRelationPolicyConfig({
    policyKey: "work.plan.items",
    settings: { targetDelete: "confirm_cascade" },
    baselineHash: HASH_A,
    expectedVersion: 0,
    actorUserId: 7,
    reason: "  初次启用关系治理  ",
  }, client);
  assert.equal(created.version, 1);
  assert.deepEqual(created.settings, { targetDelete: "confirm_cascade" });

  const updated = await writeRelationPolicyConfig({
    policyKey: "work.plan.items",
    settings: {
      targetDelete: "block",
      businessRequiredByRelation: { "work.plan.items": "required" },
    },
    baselineHash: HASH_B,
    expectedVersion: 1,
    actorUserId: 9,
    reason: "调整删除和业务必填策略",
  }, client);
  assert.equal(updated.version, 2);
  assert.equal(updated.updatedByUserId, 9);
  assert.deepEqual((await readRelationPolicyConfig("work.plan.items", client))?.settings, {
    targetDelete: "block",
    businessRequiredByRelation: { "work.plan.items": "required" },
  });

  const reset = await resetRelationPolicyConfig({
    policyKey: "work.plan.items",
    baselineHash: HASH_B,
    expectedVersion: 2,
    actorUserId: 11,
    reason: "恢复代码基线",
  }, client);
  assert.equal(reset.version, 3);
  assert.deepEqual(reset.settings, {});
  assert.equal(configs.get("work.plan.items")?.version, 3);
  assert.deepEqual(revisions.map((revision) => [revision.version, revision.changeKind]), [
    [1, "upsert"],
    [2, "upsert"],
    [3, "reset"],
  ]);
  assert.deepEqual(revisions.map((revision) => revision.reason), [
    "初次启用关系治理",
    "调整删除和业务必填策略",
    "恢复代码基线",
  ]);
});

test("holds the policy lock while the pre-persist guard and CAS write run", async () => {
  const { client, events } = mockClient();
  const policyKey = "administration.contracts.owner.department";
  await writeRelationPolicyConfig({
    policyKey,
    settings: { businessRequiredByRelation: { [policyKey]: "required" } },
    baselineHash: HASH_A,
    expectedVersion: 0,
    actorUserId: 7,
    reason: "启用业务必填",
  }, client, {
    async beforePersist({ current }) {
      assert.equal(current, null);
      events.push("preflight");
    },
  });

  assert.deepEqual(events, [
    `lock:${relationPolicyAdvisoryLockKey(policyKey)}`,
    "preflight",
    "create",
    "revision",
  ]);
});

test("reset holds the same policy lock while its pre-persist guard runs", async () => {
  const { client, events } = mockClient();
  const policyKey = "administration.contracts.owner.department";
  await writeRelationPolicyConfig({
    policyKey,
    settings: { businessRequiredByRelation: { [policyKey]: "optional" } },
    baselineHash: HASH_A,
    expectedVersion: 0,
    actorUserId: 7,
    reason: "暂设为可选",
  }, client);
  events.length = 0;

  await resetRelationPolicyConfig({
    policyKey,
    baselineHash: HASH_A,
    expectedVersion: 1,
    actorUserId: 7,
    reason: "恢复必填基线",
  }, client, {
    async beforePersist() {
      events.push("preflight");
    },
  });

  assert.deepEqual(events, [
    `lock:${relationPolicyAdvisoryLockKey(policyKey)}`,
    "preflight",
    "update",
    "revision",
  ]);
});

test("rejects stale create, update, and reset versions with a dedicated conflict", async () => {
  const { client } = mockClient();
  await writeRelationPolicyConfig({
    policyKey: "work.plan.items",
    settings: { targetDelete: "block" },
    baselineHash: HASH_A,
    expectedVersion: 0,
    actorUserId: 7,
    reason: "建立初始配置",
  }, client);

  await assert.rejects(
    writeRelationPolicyConfig({
      policyKey: "work.plan.items",
      settings: { targetDelete: "retain" },
      baselineHash: HASH_A,
      expectedVersion: 0,
      actorUserId: 7,
      reason: "并发覆盖",
    }, client),
    (error) => error instanceof RelationPolicyConfigConflictError
      && error.expectedVersion === 0
      && error.actualVersion === 1,
  );
  await assert.rejects(
    resetRelationPolicyConfig({
      policyKey: "work.plan.items",
      baselineHash: HASH_A,
      expectedVersion: 0,
      actorUserId: 7,
      reason: "并发恢复",
    }, client),
    (error) => error instanceof RelationPolicyConfigConflictError
      && error.expectedVersion === 0
      && error.actualVersion === 1,
  );
});

test("requires a non-empty audit reason for every persisted revision", async () => {
  const { client } = mockClient();
  await assert.rejects(writeRelationPolicyConfig({
    policyKey: "work.plan.items",
    settings: { targetDelete: "block" },
    baselineHash: HASH_A,
    expectedVersion: 0,
    actorUserId: 7,
    reason: "   ",
  }, client), /请填写关系策略修改理由/);
});
