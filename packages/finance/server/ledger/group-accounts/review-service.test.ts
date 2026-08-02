import assert from "node:assert/strict";
import test, { mock } from "node:test";

let sourceKind = "suggested";
let mappingUpdateCount = 1;
const mappingUpdates: unknown[] = [];
const testCompanyCode = ["0", "2"].join("");

mock.module("@workspace/platform/service-result", {
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
  financeGroupAccountRevision: {
    updateMany: async () => ({ count: 1 }),
  },
  financeGroupAccount: {
    update: async () => ({}),
  },
  financeGroupAccountMapping: {
    updateMany: async (input: unknown) => {
      mappingUpdates.push(input);
      return { count: mappingUpdateCount };
    },
  },
};

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      financeAccountingPolicyVersion: {
        findFirst: async () => ({ id: 7 }),
      },
      financeGroupAccountRevision: {
        findUnique: async () => ({
          id: 19,
          reviewStatus: "pending_review",
          updatedAt: new Date("2026-07-24T02:06:21.424Z"),
          groupAccount: {
            sourceKind,
            originCompanyCode: testCompanyCode,
            originSourceScopeKey: "T6::007",
            originLocalAccountCode: "100203",
          },
        }),
      },
      $transaction: async (operation: (value: typeof tx) => Promise<unknown>) => operation(tx),
    },
  },
} as never);

mock.module("./delete", {
  namedExports: {
    hardDeleteFinanceGroupAccount: async () => ({ ok: true }),
  },
} as never);

mock.module("./update", {
  namedExports: {
    countFinanceGroupAccountReferences: async () => ({
      mappingCount: 0,
      childCount: 0,
      ruleCount: 0,
      adjustmentCount: 0,
    }),
  },
} as never);

const { reviewFinanceGroupAccount } = await import("./review");

test("approving a suggested group account confirms only its exact origin mapping", async () => {
  sourceKind = "suggested";
  mappingUpdateCount = 1;
  mappingUpdates.length = 0;

  const result = await reviewFinanceGroupAccount({
    userId: 474,
    groupAccountId: 3673,
    decision: "approve",
    expectedUpdatedAt: "2026-07-24T02:06:21.424Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, {
    success: true,
    reviewStatus: "reviewed",
    originMappingConfirmed: true,
  });
  assert.deepEqual(mappingUpdates, [{
    where: {
      policyVersionId: 7,
      groupAccountId: 3673,
      companyCode: testCompanyCode,
      sourceScopeKey: "T6::007",
      localAccountCode: "100203",
      mappingMethod: "suggested",
    },
    data: { mappingMethod: "manual_override" },
  }]);
});

test("review does not rewrite mappings for a non-suggested group account", async () => {
  sourceKind = "manual";
  mappingUpdateCount = 1;
  mappingUpdates.length = 0;

  const result = await reviewFinanceGroupAccount({
    userId: 474,
    groupAccountId: 3673,
    decision: "approve",
    expectedUpdatedAt: "2026-07-24T02:06:21.424Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, {
    success: true,
    reviewStatus: "reviewed",
    originMappingConfirmed: false,
  });
  assert.deepEqual(mappingUpdates, []);
});
