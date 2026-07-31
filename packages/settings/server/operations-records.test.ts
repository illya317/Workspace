import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@workspace/platform/server/prisma", {
  namedExports: { prisma: {} },
} as never);
mock.module("./sql-settings-operations", {
  namedExports: { listSqlSettingOperations: async () => [] },
} as never);

test("operations records merge verified SQL requests and append-only relation revisions", async () => {
  const { buildOperationsRecordsResponse } = await import("./operations-records");
  const result = buildOperationsRecordsResponse({
    query: { page: 0, pageSize: 20, source: "all", status: "all" },
    sqlOperations: [{
      id: "sql-1",
      operation: "rotate-runtime-password",
      status: "reconciliation_required",
      settingKey: null,
      requestedValue: null,
      expectedCurrentValueMs: null,
      reason: "季度轮换",
      requestedByUserId: 7,
      createdAt: "2026-07-31T02:00:00.000Z",
      startedAt: "2026-07-31T02:01:00.000Z",
      completedAt: "2026-07-31T02:02:00.000Z",
      message: "需要人工核对",
    }],
    relationPolicyRevisions: [{
      id: 3,
      policyKey: "work.project.tasks",
      version: 4,
      changeKind: "upsert",
      reason: "允许聚合内级联",
      actorUserId: 9,
      createdAt: new Date("2026-07-31T01:00:00.000Z"),
      actor: { username: "reviewer", alias: "审核人" },
    }],
    users: new Map([[7, { username: "admin", alias: null }]]),
    generatedAt: new Date("2026-07-31T03:00:00.000Z"),
  });

  assert.equal(result.total, 2);
  assert.deepEqual(result.records.map((record) => record.id), ["sql-settings:sql-1", "relation-policy:3"]);
  assert.equal(result.records[0]?.status, "attention");
  assert.equal(result.records[0]?.actorLabel, "admin");
  assert.equal(result.records[1]?.actorLabel, "审核人");
  assert.equal(result.coverage.windowDays, 180);
  assert.deepEqual(result.coverage.providers.map((provider) => provider.source), ["sql-settings", "relation-policy"]);
});

test("operations records apply source, status, keyword, and bounded pagination", async () => {
  const { buildOperationsRecordsResponse } = await import("./operations-records");
  const result = buildOperationsRecordsResponse({
    query: {
      page: 4,
      pageSize: 1,
      source: "relation-policy",
      status: "succeeded",
      query: "xiangmu",
    },
    sqlOperations: [],
    relationPolicyRevisions: [{
      id: 1,
      policyKey: "work.project",
      version: 2,
      changeKind: "reset",
      reason: "项目策略复位",
      actorUserId: null,
      createdAt: new Date("2026-07-30T01:00:00.000Z"),
      actor: null,
    }],
    users: new Map(),
    generatedAt: new Date("2026-07-31T03:00:00.000Z"),
  });

  assert.equal(result.page, 0);
  assert.equal(result.totalPages, 1);
  assert.equal(result.total, 1);
  assert.equal(result.records[0]?.actionLabel, "重置关系策略");
  assert.equal(result.records[0]?.actorLabel, "系统");
});

test("operations records reject malformed provider timestamps", async () => {
  const { buildOperationsRecordsResponse } = await import("./operations-records");
  assert.throws(() => buildOperationsRecordsResponse({
    query: { page: 0, pageSize: 20, source: "all", status: "all" },
    sqlOperations: [{
      id: "broken",
      operation: "set-runtime-setting",
      status: "failed",
      settingKey: "lock_timeout",
      requestedValue: "10s",
      expectedCurrentValueMs: 5_000,
      reason: "测试",
      requestedByUserId: 7,
      createdAt: "invalid",
      startedAt: null,
      completedAt: null,
      message: null,
    }],
    relationPolicyRevisions: [],
    users: new Map(),
    generatedAt: new Date("2026-07-31T03:00:00.000Z"),
  }), /OPERATIONS_RECORD_INVALID_TIMESTAMP/);
});

test("operations records enforce the 180-day window for every provider", async () => {
  const { buildOperationsRecordsResponse } = await import("./operations-records");
  const generatedAt = new Date("2026-07-31T03:00:00.000Z");
  const timestamp = (daysAgo: number) => new Date(
    generatedAt.getTime() - daysAgo * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const sqlOperation = (id: string, daysAgo: number) => ({
    id,
    operation: "set-runtime-setting" as const,
    status: "succeeded" as const,
    settingKey: "lock_timeout",
    requestedValue: "10s",
    expectedCurrentValueMs: 5_000,
    reason: "窗口验证",
    requestedByUserId: 7,
    createdAt: timestamp(daysAgo),
    startedAt: timestamp(daysAgo),
    completedAt: timestamp(daysAgo),
    message: "已完成",
  });
  const relationRevision = (id: number, daysAgo: number) => ({
    id,
    policyKey: `work.project.${id}`,
    version: 1,
    changeKind: "upsert",
    reason: "窗口验证",
    actorUserId: 9,
    createdAt: new Date(timestamp(daysAgo)),
    actor: { username: "reviewer", alias: null },
  });
  const result = buildOperationsRecordsResponse({
    query: { page: 0, pageSize: 20, source: "all", status: "all" },
    sqlOperations: [sqlOperation("recent", 179), sqlOperation("expired", 181)],
    relationPolicyRevisions: [relationRevision(1, 179), relationRevision(2, 181)],
    users: new Map([[7, { username: "admin", alias: null }]]),
    generatedAt,
  });

  assert.deepEqual(result.records.map((record) => record.id).sort(), [
    "relation-policy:1",
    "sql-settings:recent",
  ]);
});
