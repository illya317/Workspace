import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@workspace/platform/server/prisma", { exports: { prisma: {} } } as never);
mock.module("../auth-token", {
  exports: { getTokenFromCookie: () => null, verifyToken: async () => null },
} as never);
mock.module("../personal-api-key", {
  exports: { findUserByPersonalApiKey: async () => null },
} as never);
mock.module("../rbac/action-grants", {
  exports: { evaluatePermissionAction: async () => false },
} as never);
mock.module("../agent/api-delegation", {
  exports: {
    AGENT_API_DELEGATION_HEADER: "x-workspace-agent-api-delegation",
    verifyAgentApiDelegation: async () => null,
  },
} as never);

const { isProgrammaticApiRequest } = await import("./authenticate");

test("personal API keys and embedded Agent delegation share the programmatic API gate", () => {
  assert.equal(isProgrammaticApiRequest(new Request("http://workspace.test/api")), false);
  assert.equal(isProgrammaticApiRequest(new Request("http://workspace.test/api", {
    headers: { "x-api-key": "personal-key" },
  })), true);
  assert.equal(isProgrammaticApiRequest(new Request("http://workspace.test/api", {
    headers: { "x-workspace-agent-api-delegation": "short-lived-delegation" },
  })), true);
});
