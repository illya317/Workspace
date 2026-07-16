import assert from "node:assert/strict";
import test, { mock } from "node:test";

class MockPermissionGrantMutationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const tx = { kind: "transaction" };
const rootClients: unknown[] = [];
let mutationCount = 0;

mock.module("@workspace/platform/effective-module-registry", {
  exports: { isResourceEnabled: () => true },
} as never);
mock.module("@workspace/platform/permission-action-grantability", {
  exports: { isPermissionActionGrantable: () => true },
} as never);
mock.module("@workspace/platform/permission-resource-policy", {
  exports: { isPermissionActionSupported: () => true },
} as never);
mock.module("@workspace/platform/space-registry", {
  exports: { isRegisteredSpaceResourceKey: () => false },
} as never);
mock.module("@workspace/platform/server/prisma", {
  exports: { prisma: { kind: "global" } },
} as never);
mock.module("./action-grant-policy", {
  exports: {
    canMutatePermissionGrantAction: (_actionKey: string, isSystemAdmin: boolean) => isSystemAdmin,
  },
} as never);
mock.module("./admin-scope", {
  exports: { canManageResourceGrant: async () => true },
} as never);
mock.module("../auth/root", {
  exports: {
    isRootAdminUser: async (_userId: number, client: unknown) => {
      rootClients.push(client);
      return false;
    },
  },
} as never);
mock.module("./action-grants", {
  exports: {
    evaluatePermissionAction: async () => false,
    PermissionGrantMutationError: MockPermissionGrantMutationError,
    setSubjectPermissionActionGrant: async (
      _subjectType: string,
      _subjectId: number,
      _resourceKey: string,
      _actionKey: string,
      _value: boolean,
      options: { beforeMutation?: (client: unknown) => Promise<void> },
    ) => {
      await options.beforeMutation?.(tx);
      mutationCount += 1;
    },
  },
} as never);

const { setPermissionGrantFromRequest } = await import("./action-grant-request");

test("generic grant callback recomputes stale isSystemAdmin through the transaction client", async () => {
  rootClients.length = 0;
  mutationCount = 0;
  const result = await setPermissionGrantFromRequest({
    actorUserId: 7,
    subjectType: "user",
    subjectId: 9,
    resourceKey: "agent.source",
    actionKey: "read",
    value: true,
    isSystemAdmin: true,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
  assert.deepEqual(rootClients, [tx]);
  assert.equal(mutationCount, 0);
});
