import assert from "node:assert/strict";
import test, { mock } from "node:test";

let capabilityAllowed = false;
let tokenCreates = 0;
const attempts: boolean[] = [];

mock.module("./auth/wecom", {
  namedExports: {
    buildWecomInAppLoginUrl: () => "",
    buildWecomWebLoginUrl: () => "",
    getWecomUserByCode: async () => ({ userId: "" }),
    getWecomUserDetail: async () => null,
  },
} as never);
mock.module("./auth/session", {
  namedExports: { getCurrentUser: async () => null },
} as never);
mock.module("./auth", {
  namedExports: {
    createToken: async () => {
      tokenCreates += 1;
      return "session-token";
    },
    isKicked: async () => false,
  },
} as never);
mock.module("./personal-api-key", {
  namedExports: {
    findUserByPersonalApiKey: async () => ({
      id: 7,
      username: "employee",
      canLogin: true,
      wxUserId: null,
      sessionVersion: 3,
    }),
    hashPersonalApiKey: () => "hashed-key",
  },
} as never);
mock.module("./prisma", {
  namedExports: { prisma: {} },
} as never);
mock.module("./rbac/action-grants", {
  namedExports: {
    evaluatePermissionAction: async (
      _userId: number,
      resourceKey: string,
      actionKey: string,
    ) => capabilityAllowed && resourceKey === "settings.account.apiAccess" && actionKey === "entry",
  },
} as never);
mock.module("./security", {
  namedExports: {
    checkBruteForce: async () => ({ blocked: false, remaining: 5, retryAfter: 0 }),
    recordAttempt: async (_attemptKey: string, _ip: string, success: boolean) => {
      attempts.push(success);
    },
  },
} as never);

const { loginWithApiKey } = await import("./account");

test("personal API Key login requires the account API-access capability before issuing a session", async () => {
  capabilityAllowed = false;
  const denied = await loginWithApiKey("employee", "valid-key", "127.0.0.1");
  assert.deepEqual(denied, {
    success: false,
    status: 403,
    error: "当前账号未开通个人 API 使用权限",
  });
  assert.equal(tokenCreates, 0);
  assert.deepEqual(attempts, [false]);

  capabilityAllowed = true;
  const allowed = await loginWithApiKey("employee", "valid-key", "127.0.0.1");
  assert.deepEqual(allowed, { success: true, token: "session-token" });
  assert.equal(tokenCreates, 1);
  assert.deepEqual(attempts, [false, true]);
});
