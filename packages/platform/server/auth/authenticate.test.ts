import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@workspace/platform/server/prisma", { namedExports: { prisma: {} } } as never);
mock.module("../auth-token", {
  namedExports: { getTokenFromCookie: () => null, verifyToken: async () => null },
} as never);
mock.module("../personal-api-key", {
  namedExports: { findUserByPersonalApiKey: async () => null },
} as never);
mock.module("../rbac/action-grants", {
  namedExports: { evaluatePermissionAction: async () => false },
} as never);
mock.module("../agent-api-delegation", {
  namedExports: {
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
