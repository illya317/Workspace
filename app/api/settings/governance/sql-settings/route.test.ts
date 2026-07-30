import assert from "node:assert/strict";
import test, { mock } from "node:test";

let superAdmin = true;
let createdOperation: Record<string, unknown> | null = null;
class MockSqlSettingOperationValidationError extends Error {}

mock.module("@workspace/platform/server/auth", {
  namedExports: {
    requireApiAccess: async () => ({ ok: true, user: { userId: 1 } }),
    isSuperAdmin: async () => superAdmin,
  },
} as never);
mock.module("@workspace/settings/server/sql-settings", {
  namedExports: {
    listSqlSettingsCatalog: async () => ({
      generatedAt: "2026-07-31T00:00:00.000Z",
      databaseName: "workspace",
      roleName: "workspace_runtime",
      serverVersion: "16.14",
      transport: { ssl: true, protocol: "TLSv1.3", cipher: "cipher" },
      groups: [],
      operations: [],
    }),
  },
} as never);
mock.module("@workspace/settings/server/sql-settings-operations", {
  namedExports: {
    SqlSettingOperationConflictError: class SqlSettingOperationConflictError extends Error {},
    SqlSettingOperationQueueError: class SqlSettingOperationQueueError extends Error {},
    createSqlSettingOperation: async (input: Record<string, unknown>, userId: number, idempotencyKey: string) => {
      if (input.operation === "rotate-runtime-password" && input.confirmation !== "ROTATE") {
        throw new MockSqlSettingOperationValidationError("请输入 ROTATE 确认密码轮换");
      }
      createdOperation = { ...input, userId, idempotencyKey };
      return { id: "request-1", ...input, status: "pending" };
    },
  },
} as never);
mock.module("@workspace/settings/server/sql-settings-operation-validation", {
  namedExports: {
    SqlSettingOperationValidationError: MockSqlSettingOperationValidationError,
  },
} as never);

test("SQL settings catalog is visible to root governance", async () => {
  superAdmin = true;
  const { GET } = await import("./route");
  const response = await GET(new Request("http://localhost/api/settings/governance/sql-settings"));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).roleName, "workspace_runtime");
});

test("SQL settings catalog remains root only", async () => {
  superAdmin = false;
  const { GET } = await import("./route");
  const response = await GET(new Request("http://localhost/api/settings/governance/sql-settings"));

  assert.equal(response.status, 403);
});

test("root can enqueue an allowlisted SQL setting operation", async () => {
  superAdmin = true;
  createdOperation = null;
  const { PATCH } = await import("./route");
  const response = await PATCH(new Request("http://localhost/api/settings/governance/sql-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "request-12345678" },
    body: JSON.stringify({
      operation: "set-runtime-setting",
      settingKey: "lock_timeout",
      value: "10s",
      expectedCurrentValueMs: 5000,
      reason: "降低锁等待风险",
    }),
  }));

  assert.equal(response.status, 202);
  assert.deepEqual(createdOperation, {
    operation: "set-runtime-setting",
    settingKey: "lock_timeout",
    value: "10s",
    expectedCurrentValueMs: 5000,
    reason: "降低锁等待风险",
    userId: 1,
    idempotencyKey: "request-12345678",
  });
});

test("password rotation requires explicit confirmation", async () => {
  superAdmin = true;
  const { PATCH } = await import("./route");
  const response = await PATCH(new Request("http://localhost/api/settings/governance/sql-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "request-rotate-1" },
    body: JSON.stringify({ operation: "rotate-runtime-password", reason: "季度凭据轮换", confirmation: "yes" }),
  }));

  assert.equal(response.status, 422);
});
