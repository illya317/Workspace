import assert from "node:assert/strict";
import test, { mock } from "node:test";

let superAdmin = true;

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
    }),
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
