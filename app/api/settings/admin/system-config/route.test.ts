import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { defaultBusinessCodeConfig } from "@workspace/platform/business-code-config";

let updateInput: unknown = null;

mock.module("@workspace/platform/server/auth", {
  namedExports: {
    requireAdminApiAccess: async () => ({ ok: true, user: { userId: 1 } }),
    isSuperAdmin: async () => true,
  },
} as never);
mock.module("@workspace/platform/server/system-config", {
  namedExports: {
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

test("Settings system config accepts the centralized business code rules", async () => {
  const { PUT } = await import("./route");
  const businessCodeConfig = defaultBusinessCodeConfig({
    companyProjectCodePrefix: "EX",
    companyProjectSequenceWidth: 3,
    companyProjectSequenceStart: 1,
    companyProjectSequenceEnd: 99,
    departmentProjectSequenceWidth: 3,
    otherProjectSequenceStart: 101,
  });
  updateInput = null;
  const response = await PUT(new Request("http://localhost/api/settings/admin/system-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businessCodeConfig }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(updateInput, { businessCodeConfig });
});

test("Settings system config rejects non-five-digit Finance asset sequences", async () => {
  const { PUT } = await import("./route");
  const businessCodeConfig = defaultBusinessCodeConfig({
    companyProjectCodePrefix: "EX",
    companyProjectSequenceWidth: 3,
    companyProjectSequenceStart: 1,
    companyProjectSequenceEnd: 99,
    departmentProjectSequenceWidth: 3,
    otherProjectSequenceStart: 101,
  });
  const response = await PUT(new Request("http://localhost/api/settings/admin/system-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessCodeConfig: {
        ...businessCodeConfig,
        financeAsset: {
          ...businessCodeConfig.financeAsset,
          segments: businessCodeConfig.financeAsset.segments.map((segment) => (
            segment.kind === "sequence" ? { ...segment, length: 6 } : segment
          )),
        },
      },
    }),
  }));
  assert.equal(response.status, 400);
});

test("Settings system config rejects unrecognized date formats", async () => {
  const { PUT } = await import("./route");
  const businessCodeConfig = defaultBusinessCodeConfig({
    companyProjectCodePrefix: "EX",
    companyProjectSequenceWidth: 3,
    companyProjectSequenceStart: 1,
    companyProjectSequenceEnd: 99,
    departmentProjectSequenceWidth: 3,
    otherProjectSequenceStart: 101,
  });
  const response = await PUT(new Request("http://localhost/api/settings/admin/system-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessCodeConfig: {
        ...businessCodeConfig,
        customer: {
          segments: [
            { kind: "date", source: "createdAt", format: "yyyyMM" },
            { kind: "sequence", length: 5 },
          ],
          sequenceStart: 1,
        },
      },
    }),
  }));
  assert.equal(response.status, 400);
});
