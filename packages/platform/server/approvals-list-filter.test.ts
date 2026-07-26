import assert from "node:assert/strict";
import test, { mock } from "node:test";

let capturedWhere: Record<string, unknown> | null = null;

mock.module("./prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      approvalRequest: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          capturedWhere = where;
          return [];
        },
      },
    },
  },
} as never);

const { listRequests } = await import("./approvals");

test("approval request listing can constrain rows by submitter before serialization", async () => {
  const result = await listRequests({
    adapter: {
      subjectType: "hr.performance.review",
      resolveAccess: async () => true,
    } as never,
    actorUserId: 7,
    resourceKey: "hr.performance",
    scopeId: null,
    submitterUserId: 7,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(capturedWhere, {
    subjectType: "hr.performance.review",
    resourceKey: "hr.performance",
    scopeId: null,
    submitterUserId: 7,
  });
});
