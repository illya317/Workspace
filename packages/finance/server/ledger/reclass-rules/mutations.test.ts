import assert from "node:assert/strict";
import test, { mock } from "node:test";

const materializedScopes: number[][] = [];

mock.module("@workspace/platform/server/api", {
  namedExports: {
    isPlatformServiceResult: () => false,
    jsonErrorResponse: () => new Response(null, { status: 400 }),
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
    serviceOk: <T>(data: T) => ({ ok: true, data }),
    serviceResponse: (result: unknown) => result,
  },
} as never);

mock.module("@workspace/platform/server/business-action-executor", {
  namedExports: {
    assertBusinessActionDirectExecutionAllowed: async () => ({ ok: true }),
  },
} as never);

const tx = {
  financeReclassRule: { upsert: async () => ({}) },
  financeGroupAccountRevision: {
    findMany: async () => [{ groupAccountId: 10, parentGroupAccountId: null }],
  },
};

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      financeAccountingPolicyVersion: {
        findFirst: async () => ({ id: 1, status: "published", effectiveTo: null }),
      },
      financeGroupAccountRevision: {
        findMany: async () => [{ groupAccountId: 10, code: "1607" }],
      },
      financeGroupAccountMapping: { findMany: async () => [] },
      $transaction: async (operation: (value: typeof tx) => Promise<unknown>) => operation(tx),
    },
  },
} as never);

mock.module("./candidates", {
  namedExports: { loadGroupAccountIdsWithAuxiliaryFacts: async () => new Set<number>() },
} as never);

mock.module("../balance-reclass/automatic", {
  namedExports: { AutomaticReclassConflictError: class extends Error {} },
} as never);

mock.module("./materialize", {
  namedExports: { ReclassMaterializationConflictError: class extends Error {} },
} as never);

mock.module("./materialize-confirmed", {
  namedExports: {
    materializeConfirmedReclassAdjustments: async (
      _tx: unknown,
      _policyVersionId: number,
      sourceGroupAccountIds: readonly number[],
    ) => {
      materializedScopes.push([...sourceGroupAccountIds]);
      return {
        auxiliary: { written: 0, updated: 0, deleted: 0, skippedProtected: 0 },
        automatic: { written: 0, updated: 0, deleted: 0, skippedProtected: 0 },
      };
    },
  },
} as never);

const { saveReclassRuleChangeSet } = await import("./mutations");

test("single-rule save materializes only the changed source scope", async () => {
  materializedScopes.length = 0;

  const result = await saveReclassRuleChangeSet({
    userId: 1,
    policyVersionId: 1,
    changes: [{
      sourceGroupAccountId: 10,
      abnormalSide: "credit",
      targetGroupAccountId: null,
    }],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(materializedScopes, [[10]]);
});
