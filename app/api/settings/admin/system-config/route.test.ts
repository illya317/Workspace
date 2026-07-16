import assert from "node:assert/strict";
import test, { mock } from "node:test";

let updateInput: unknown = null;

mock.module("@workspace/platform/server/auth", {
  exports: {
    requireAdminApiAccess: async () => ({ ok: true, user: { userId: 1 } }),
    isSuperAdmin: async () => true,
  },
} as never);
mock.module("@workspace/platform/server/system-config", {
  exports: {
    getSystemConfig: async () => ({
      conflictStrategy: "union",
      agentAllowedActions: ["read", "submit"],
    }),
    updateSystemConfig: async (input: unknown) => {
      updateInput = input;
      return { success: true };
    },
  },
} as never);

test("Settings system config exposes the headless Agent action policy", async () => {
  const { GET } = await import("./route");
  const response = await GET(new Request("http://localhost/api/settings/admin/system-config"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    conflictStrategy: "union",
    agentAllowedActions: ["read", "submit"],
  });
});

test("Settings system config updates the headless Agent action policy", async () => {
  const { PUT } = await import("./route");
  updateInput = null;
  const response = await PUT(new Request("http://localhost/api/settings/admin/system-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentAllowedActions: ["read"] }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(updateInput, { agentAllowedActions: ["read"] });
});

test("Settings system config still updates conflict policy", async () => {
  const { PUT } = await import("./route");
  updateInput = null;
  const response = await PUT(new Request("http://localhost/api/settings/admin/system-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conflictStrategy: "deny_override" }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(updateInput, { conflictStrategy: "deny_override" });
});
