import assert from "node:assert/strict";
import test, { mock } from "node:test";

type HandoffRow = {
  id: string;
  browserSecretHash: string;
  oauthStateHash: string;
  returnTokenHash: string | null;
  verificationHash: string | null;
  nextPath: string;
  userId: number | null;
  failedAttempts: number;
  expiresAt: Date;
  approvedAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
};

const handoffs = new Map<string, HandoffRow>();
let createdTokenPayload: Record<string, unknown> | null = null;

function matches(row: HandoffRow, where: Record<string, unknown>) {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.oauthStateHash !== undefined && row.oauthStateHash !== where.oauthStateHash) return false;
  if (where.approvedAt === null && row.approvedAt !== null) return false;
  if (where.consumedAt === null && row.consumedAt !== null) return false;

  const approvedAt = where.approvedAt as { not?: null } | undefined;
  if (approvedAt?.not === null && row.approvedAt === null) return false;
  const expiresAt = where.expiresAt as { gt?: Date } | undefined;
  if (expiresAt?.gt && row.expiresAt <= expiresAt.gt) return false;
  const failedAttempts = where.failedAttempts as { lt?: number } | undefined;
  if (failedAttempts?.lt !== undefined && row.failedAttempts >= failedAttempts.lt) return false;
  return true;
}

mock.module("server-only", { namedExports: {} } as never);
mock.module("./account", {
  namedExports: {
    authenticateWithWecomCode: async () => ({
      success: true,
      user: { id: 7, wxUserId: "wecom-user-7", sessionVersion: 3 },
    }),
  },
} as never);
mock.module("./auth-token", {
  namedExports: {
    createToken: async (payload: Record<string, unknown>) => {
      createdTokenPayload = payload;
      return "signed-session-token";
    },
  },
} as never);
mock.module("./auth/wecom", {
  namedExports: {
    buildWecomInAppLoginUrl: (redirectUri: string, state: string) => {
      const url = new URL("https://open.weixin.qq.com/connect/oauth2/authorize");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      return url.toString();
    },
  },
} as never);
mock.module("./prisma", {
  namedExports: {
    prisma: {
      wecomLoginHandoff: {
        deleteMany: async ({ where }: { where: { expiresAt: { lte: Date } } }) => {
          for (const [id, row] of handoffs) {
            if (row.expiresAt <= where.expiresAt.lte) handoffs.delete(id);
          }
          return { count: 0 };
        },
        create: async ({ data }: { data: Omit<HandoffRow, "createdAt" | "failedAttempts" | "approvedAt" | "consumedAt" | "returnTokenHash" | "verificationHash" | "userId"> }) => {
          const row: HandoffRow = {
            ...data,
            returnTokenHash: null,
            verificationHash: null,
            userId: null,
            failedAttempts: 0,
            approvedAt: null,
            consumedAt: null,
            createdAt: new Date(),
          };
          handoffs.set(row.id, row);
          return row;
        },
        findUnique: async ({ where }: { where: Record<string, unknown> }) => {
          const row = [...handoffs.values()].find((candidate) => matches(candidate, where));
          if (!row) return null;
          return {
            ...row,
            user: row.userId === null
              ? null
              : {
                id: row.userId,
                wxUserId: "wecom-user-7",
                canLogin: true,
                sessionVersion: 3,
              },
          };
        },
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const row = [...handoffs.values()].find((candidate) => matches(candidate, where));
          if (!row) return { count: 0 };
          for (const [key, value] of Object.entries(data)) {
            if (key === "failedAttempts" && typeof value === "object" && value) {
              row.failedAttempts += Number((value as { increment?: number }).increment ?? 0);
            } else {
              (row as unknown as Record<string, unknown>)[key] = value;
            }
          }
          return { count: 1 };
        },
      },
    },
  },
} as never);

const {
  approveWecomLoginHandoff,
  createWecomLoginHandoff,
  consumeWecomLoginHandoff,
  normalizeWecomHandoffNextPath,
} = await import("./wecom-login-handoff");

test.beforeEach(() => {
  handoffs.clear();
  createdTokenPayload = null;
});

test("mobile handoff keeps the browser secret out of the app launch URL", async () => {
  const handoff = await createWecomLoginHandoff({
    origin: "https://workspace.example.com",
    basePath: "/workspace",
    nextPath: "/workspace/work",
  });

  const [id, browserSecret] = handoff.cookieValue.split(".");
  const row = handoffs.get(id);
  const authorizeUrl = new URL(handoff.launchUrl).searchParams.get("url");

  assert.ok(row);
  assert.ok(browserSecret);
  assert.equal(row.nextPath, "/workspace/work");
  assert.notEqual(row.browserSecretHash, browserSecret);
  assert.ok(authorizeUrl);
  assert.equal(authorizeUrl.includes(browserSecret), false);
  assert.equal(handoff.expiresAt.getTime() - row.createdAt.getTime() <= 5 * 60 * 1000, true);
});

test("handoff requires both the originating browser cookie and an authenticated return credential", async () => {
  const handoff = await createWecomLoginHandoff({
    origin: "https://workspace.example.com",
    basePath: "/workspace",
    nextPath: "/workspace/portal",
  });
  const authorizeUrl = new URL(handoff.launchUrl).searchParams.get("url");
  assert.ok(authorizeUrl);
  const oauthState = new URL(authorizeUrl).searchParams.get("state");
  assert.ok(oauthState);

  const approval = await approveWecomLoginHandoff(oauthState, "oauth-code");
  assert.equal(approval.success, true);
  if (!approval.success) return;
  assert.match(approval.verificationCode, /^\d{8}$/);

  assert.deepEqual(
    await consumeWecomLoginHandoff({ cookieValue: handoff.cookieValue }),
    { status: "awaiting_return" },
  );
  const returnToken = `${approval.handoffId}.${approval.returnToken}`;
  const missingBrowser = await consumeWecomLoginHandoff({
    cookieValue: null,
    returnToken,
  });
  assert.equal(missingBrowser.status, "error");
  const wrongBrowser = await consumeWecomLoginHandoff({
    cookieValue: `another-handoff.${"x".repeat(43)}`,
    returnToken,
  });
  assert.equal(wrongBrowser.status, "error");

  const authenticated = await consumeWecomLoginHandoff({
    cookieValue: handoff.cookieValue,
    returnToken,
  });
  assert.deepEqual(authenticated, {
    status: "authenticated",
    token: "signed-session-token",
    nextPath: "/workspace/portal",
  });
  assert.deepEqual(createdTokenPayload, {
    userId: 7,
    wxUserId: "wecom-user-7",
    departmentId: 0,
    sessionVersion: 3,
  });
});

test("fallback verification code is retry-limited and consumes the handoff once", async () => {
  const handoff = await createWecomLoginHandoff({
    origin: "https://workspace.example.com",
    basePath: "/workspace",
  });
  const authorizeUrl = new URL(handoff.launchUrl).searchParams.get("url");
  assert.ok(authorizeUrl);
  const oauthState = new URL(authorizeUrl).searchParams.get("state");
  assert.ok(oauthState);
  const approval = await approveWecomLoginHandoff(oauthState, "oauth-code");
  assert.equal(approval.success, true);
  if (!approval.success) return;

  const wrongCode = await consumeWecomLoginHandoff({
    cookieValue: handoff.cookieValue,
    verificationCode: "00000000" === approval.verificationCode ? "11111111" : "00000000",
  });
  assert.equal(wrongCode.status, "error");
  if (wrongCode.status === "error") assert.equal(wrongCode.retryable, true);

  const authenticated = await consumeWecomLoginHandoff({
    cookieValue: handoff.cookieValue,
    verificationCode: approval.verificationCode,
  });
  assert.equal(authenticated.status, "authenticated");

  const replay = await consumeWecomLoginHandoff({
    cookieValue: handoff.cookieValue,
    verificationCode: approval.verificationCode,
  });
  assert.equal(replay.status, "error");
});

test("next path normalization rejects paths outside the configured base path", () => {
  assert.equal(normalizeWecomHandoffNextPath("//attacker.example", "/workspace"), "/workspace/portal");
  assert.equal(normalizeWecomHandoffNextPath("/admin", "/workspace"), "/workspace/portal");
  assert.equal(normalizeWecomHandoffNextPath("/workspace/work", "/workspace"), "/workspace/work");
});
