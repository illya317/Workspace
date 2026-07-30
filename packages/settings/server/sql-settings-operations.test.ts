import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, mock } from "node:test";

const requestHmacText = "ab".repeat(32);
const fixtureDirectory = mkdtempSync(join(tmpdir(), "workspace-sql-settings-signature-"));
const requestHmacFile = join(fixtureDirectory, "request-hmac");
writeFileSync(requestHmacFile, `${requestHmacText}\n`, { mode: 0o600 });
process.env.WORKSPACE_SQL_SETTINGS_REQUEST_HMAC_FILE = requestHmacFile;

after(() => {
  delete process.env.WORKSPACE_SQL_SETTINGS_REQUEST_HMAC_FILE;
  rmSync(fixtureDirectory, { recursive: true, force: true });
});

const rows: Array<{ key: string; value: string }> = [];
const deletedKeys: string[] = [];
const systemConfig = {
  findMany: async ({ take }: { take: number }) => rows.slice().sort((left, right) => right.key.localeCompare(left.key)).slice(0, take),
  create: async ({ data }: { data: { key: string; value: string } }) => {
    rows.push(data);
    return data;
  },
  deleteMany: async ({ where }: { where: { key: { in: string[] } } }) => {
    const keys = new Set(where.key.in);
    const initialLength = rows.length;
    deletedKeys.push(...where.key.in);
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (keys.has(rows[index]!.key)) rows.splice(index, 1);
    }
    return { count: initialLength - rows.length };
  },
};
const transactionClient = { $executeRaw: async () => 1, systemConfig };

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: { sql: () => ({}) },
    prisma: {
      systemConfig,
      $transaction: async (callback: (client: typeof transactionClient) => unknown) => callback(transactionClient),
    },
  },
} as never);

interface StoredRequestFixture {
  requestId: string;
  operation: "set-runtime-setting" | "rotate-runtime-password";
  status: "pending" | "running" | "succeeded" | "failed" | "reconciliation_required";
  settingKey: string | null;
  requestedValue: string | null;
  expectedCurrentValueMs: number | null;
  reason: string;
  requestedByUserId: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  message: string | null;
  idempotencyHash: string;
  requestFingerprint: string;
}

function canonicalRequest(value: StoredRequestFixture) {
  return JSON.stringify({
    requestId: value.requestId,
    operation: value.operation,
    settingKey: value.settingKey,
    requestedValue: value.requestedValue,
    expectedCurrentValueMs: value.expectedCurrentValueMs,
    reason: value.reason,
    requestedByUserId: value.requestedByUserId,
    createdAt: value.createdAt,
    idempotencyHash: value.idempotencyHash,
    requestFingerprint: value.requestFingerprint,
  });
}

function signedStoredRequest(overrides: Partial<StoredRequestFixture> = {}) {
  const value: StoredRequestFixture = {
    requestId: "request-1",
    operation: "rotate-runtime-password",
    status: "succeeded",
    settingKey: null,
    requestedValue: null,
    expectedCurrentValueMs: null,
    reason: "季度凭据轮换",
    requestedByUserId: 7,
    createdAt: "2026-07-31T00:00:00.000Z",
    startedAt: "2026-07-31T00:01:00.000Z",
    completedAt: "2026-07-31T00:02:00.000Z",
    message: "凭据已轮换并验证",
    idempotencyHash: "a".repeat(64),
    requestFingerprint: "b".repeat(64),
    ...overrides,
  };
  return {
    ...value,
    requestSignature: createHmac("sha256", requestHmacText).update(canonicalRequest(value), "utf8").digest("hex"),
  };
}

test("operation parser verifies the signed request, binds it to the row key, and rejects secret-shaped fields", async () => {
  const { parseSqlSettingOperation, SQL_SETTING_OPERATION_PREFIX } = await import("./sql-settings-operations");
  const stored = signedStoredRequest();
  const safeOperation = parseSqlSettingOperation(
    `${SQL_SETTING_OPERATION_PREFIX}${stored.requestId}`,
    JSON.stringify(stored),
  );

  assert.deepEqual(safeOperation, {
    id: "request-1",
    operation: "rotate-runtime-password",
    status: "succeeded",
    settingKey: null,
    requestedValue: null,
    expectedCurrentValueMs: null,
    reason: "季度凭据轮换",
    requestedByUserId: 7,
    createdAt: "2026-07-31T00:00:00.000Z",
    startedAt: "2026-07-31T00:01:00.000Z",
    completedAt: "2026-07-31T00:02:00.000Z",
    message: "凭据已轮换并验证",
  });
  assert.equal(parseSqlSettingOperation(
    `${SQL_SETTING_OPERATION_PREFIX}copied-request-id`,
    JSON.stringify(stored),
  ), null);
  assert.equal(parseSqlSettingOperation(
    `${SQL_SETTING_OPERATION_PREFIX}${stored.requestId}`,
    JSON.stringify({ ...stored, reason: "被篡改的轮换原因" }),
  ), null);
  assert.equal(parseSqlSettingOperation(
    `${SQL_SETTING_OPERATION_PREFIX}${stored.requestId}`,
    JSON.stringify({ ...stored, password: "must-not-be-exposed" }),
  ), null);
});

test("operation creation signs the canonical record with normalized UTF-8 key text and remains idempotent", async () => {
  rows.length = 0;
  deletedKeys.length = 0;
  const {
    canonicalizeSqlSettingOperationRequest,
    createSqlSettingOperation,
    parseSqlSettingOperation,
    SqlSettingOperationConflictError,
  } = await import("./sql-settings-operations");
  const input = {
    operation: "set-runtime-setting" as const,
    settingKey: "lock_timeout",
    value: "10s",
    expectedCurrentValueMs: 5000,
    reason: "降低锁等待风险",
  };
  const first = await createSqlSettingOperation(input, 7, "same-request-key");
  const replay = await createSqlSettingOperation(input, 7, "same-request-key");
  const stored = JSON.parse(rows[0]!.value) as StoredRequestFixture & { requestSignature: string };

  assert.equal(replay.id, first.id);
  assert.equal(rows.length, 1);
  assert.equal(stored.requestId, first.id);
  assert.match(stored.requestSignature, /^[a-f0-9]{64}$/);
  assert.equal(
    stored.requestSignature,
    createHmac("sha256", requestHmacText)
      .update(canonicalizeSqlSettingOperationRequest(stored), "utf8")
      .digest("hex"),
  );
  assert.notEqual(
    stored.requestSignature,
    createHmac("sha256", Buffer.from(requestHmacText, "hex"))
      .update(canonicalizeSqlSettingOperationRequest(stored), "utf8")
      .digest("hex"),
  );
  assert.notEqual(parseSqlSettingOperation(rows[0]!.key, rows[0]!.value), null);
  assert.equal(rows[0]!.value.includes("password"), false);
  await assert.rejects(
    () => createSqlSettingOperation({ ...input, value: "15s" }, 7, "same-request-key"),
    SqlSettingOperationConflictError,
  );
});

test("tampered or unsigned queue records fail closed", async () => {
  rows.length = 0;
  deletedKeys.length = 0;
  const {
    listSqlSettingOperations,
    SQL_SETTING_OPERATION_PREFIX,
    SqlSettingOperationQueueError,
  } = await import("./sql-settings-operations");
  const stored = signedStoredRequest({ requestId: "tampered-request" });
  rows.push({
    key: `${SQL_SETTING_OPERATION_PREFIX}${stored.requestId}`,
    value: JSON.stringify({ ...stored, requestedByUserId: 8 }),
  });
  await assert.rejects(() => listSqlSettingOperations(), SqlSettingOperationQueueError);

  rows[0]!.value = JSON.stringify({ ...stored, requestSignature: undefined });
  await assert.rejects(() => listSqlSettingOperations(), SqlSettingOperationQueueError);

  rows.length = 0;
  for (let index = 0; index < 20; index += 1) {
    const requestId = `valid-newer-${String(index).padStart(2, "0")}`;
    const valid = signedStoredRequest({ requestId });
    rows.push({ key: `${SQL_SETTING_OPERATION_PREFIX}${requestId}`, value: JSON.stringify(valid) });
  }
  rows.push({ key: `${SQL_SETTING_OPERATION_PREFIX}000-corrupt-older`, value: "{}" });
  await assert.rejects(() => listSqlSettingOperations(20), SqlSettingOperationQueueError);
});

test("a full queue prunes only oldest terminal history to the target before creating", async () => {
  rows.length = 0;
  deletedKeys.length = 0;
  const { createSqlSettingOperation, SQL_SETTING_OPERATION_PREFIX } = await import("./sql-settings-operations");
  for (let index = 0; index < 128; index += 1) {
    const requestId = `history-${String(index).padStart(3, "0")}`;
    const active = index >= 126;
    const stored = signedStoredRequest({
      requestId,
      operation: "set-runtime-setting",
      status: index === 126 ? "pending" : index === 127 ? "running" : "succeeded",
      settingKey: active ? (index === 126 ? "statement_timeout" : "idle_in_transaction_session_timeout") : "lock_timeout",
      requestedValue: active ? "60s" : "10s",
      expectedCurrentValueMs: 5000,
      idempotencyHash: index.toString(16).padStart(64, "0"),
      requestFingerprint: (index + 256).toString(16).padStart(64, "0"),
    });
    rows.push({ key: `${SQL_SETTING_OPERATION_PREFIX}${requestId}`, value: JSON.stringify(stored) });
  }

  await createSqlSettingOperation({
    operation: "set-runtime-setting",
    settingKey: "lock_timeout",
    value: "15s",
    expectedCurrentValueMs: 10_000,
    reason: "调整锁等待保护",
  }, 7, "new-request-after-cleanup");

  assert.equal(deletedKeys.length, 32);
  assert.equal(rows.length, 97);
  assert.equal(deletedKeys.includes(`${SQL_SETTING_OPERATION_PREFIX}history-126`), false);
  assert.equal(deletedKeys.includes(`${SQL_SETTING_OPERATION_PREFIX}history-127`), false);
  assert.equal(rows.some((row) => row.key === `${SQL_SETTING_OPERATION_PREFIX}history-126`), true);
  assert.equal(rows.some((row) => row.key === `${SQL_SETTING_OPERATION_PREFIX}history-127`), true);
});
