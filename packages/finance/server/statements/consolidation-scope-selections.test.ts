import assert from "node:assert/strict";
import { mock, test } from "node:test";

mock.module("server-only", { namedExports: {} } as never);

const authorizationCalls: unknown[] = [];
mock.module("@workspace/platform/server/business-action-executor", {
  namedExports: {
    assertBusinessActionDirectExecutionAllowed: async (input: unknown) => {
      authorizationCalls.push(input);
      return { ok: true };
    },
  },
});

const parent = {
  companyId: 1,
  companyCode: "P",
  companyName: "母公司",
  role: "parent" as const,
  directParentCompanyId: null,
  directParentCode: null,
  relationId: null,
  relationUpdatedAt: null,
  relationEffectiveFrom: null,
  relationEffectiveTo: null,
  relationVersion: null,
  shareRatio: 1,
  isConsolidated: true,
  functionalCurrency: "CNY",
  currencyEvidence: "ERP",
  currencyDecidedBy: null,
};
const child = {
  ...parent,
  companyId: 2,
  companyCode: "C",
  companyName: "子公司",
  role: "subsidiary" as const,
  directParentCompanyId: 1,
  directParentCode: "P",
  relationId: 20,
  relationVersion: 3,
  shareRatio: 1,
};
const grandchild = {
  ...child,
  companyId: 3,
  companyCode: "G",
  companyName: "孙公司",
  directParentCompanyId: 2,
  directParentCode: "C",
  relationId: 30,
  relationVersion: 4,
};
const candidates = [parent, child, grandchild];
let selections: Array<{ companyId: number; relationId: number; relationVersion: number; included: boolean }> = [];
const upserts: unknown[] = [];
let existingBatchId: number | null = null;

mock.module("./consolidation-snapshots", {
  namedExports: {
    ConsolidationSnapshotError: class ConsolidationSnapshotError extends Error {
      constructor(message: string, readonly status = 400) {
        super(message);
      }
    },
    loadConsolidationCandidateFacts: async () => candidates,
    loadConsolidationScopeFactsWithOverrides: async (
      _parentCompanyId: number,
      _asOfDate: string,
      overrides: ReadonlyMap<number, boolean>,
    ) => {
      const includedIds = new Set([1]);
      for (const candidate of candidates) {
        if (candidate.role === "parent") continue;
        const included = overrides.get(candidate.companyId) ?? candidate.isConsolidated;
        if (included && candidate.directParentCompanyId && includedIds.has(candidate.directParentCompanyId)) {
          includedIds.add(candidate.companyId);
        }
      }
      return candidates.filter((candidate) => includedIds.has(candidate.companyId));
    },
    periodEndDate: (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}-30`,
  },
});

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      financeConsolidationBatch: {
        findFirst: async () => existingBatchId ? { id: existingBatchId } : null,
      },
      financeConsolidationScopeSelection: {
        findMany: async () => selections,
        upsert: async (args: unknown) => {
          upserts.push(args);
          return args;
        },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    },
  },
});

const {
  loadFinanceConsolidationScope,
  saveFinanceConsolidationScopeSelection,
} = await import("./consolidation-scope-selections");

test("a Finance selection overrides only the one-off connected scope", async () => {
  selections = [
    { companyId: 2, relationId: 20, relationVersion: 3, included: false },
    { companyId: 3, relationId: 30, relationVersion: 4, included: true },
  ];
  const result = await loadFinanceConsolidationScope({
    parentCompanyId: 1,
    year: 2026,
    month: 7,
    periodKind: "month",
  }, "2026-07-31");
  assert.deepEqual(result.candidates.map((candidate) => [candidate.companyId, candidate.isConsolidated]), [
    [1, true],
    [2, false],
    [3, true],
  ]);
  assert.deepEqual(result.scope.map((candidate) => candidate.companyId), [1]);
});

test("saving an exclusion uses finance.statements.update and cascades only through Finance selection rows", async () => {
  selections = [];
  existingBatchId = null;
  upserts.length = 0;
  authorizationCalls.length = 0;
  const result = await saveFinanceConsolidationScopeSelection({
    userId: 9,
    input: {
      parentCompanyId: 1,
      year: 2026,
      month: 7,
      periodKind: "month",
      companyId: 2,
      relationId: 20,
      expectedRelationVersion: 3,
      included: false,
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(authorizationCalls, [{
    businessActionKey: "finance.statements.consolidationScope.save",
    actorUserId: 9,
    resourceKey: "finance.statements",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "本次合并报表范围已配置为必须走流程，请从统一保存入口提交",
  }]);
  assert.equal(upserts.length, 2);
  assert.deepEqual(upserts.map((value) => {
    const input = value as { create: { companyId: number; included: boolean } };
    return [input.create.companyId, input.create.included];
  }), [[2, false], [3, false]]);
});

test("does not leave a new pre-batch selection after a batch already exists", async () => {
  existingBatchId = 88;
  upserts.length = 0;
  const result = await saveFinanceConsolidationScopeSelection({
    userId: 9,
    input: {
      parentCompanyId: 1,
      year: 2026,
      month: 7,
      periodKind: "month",
      companyId: 2,
      relationId: 20,
      expectedRelationVersion: 3,
      included: false,
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.equal(upserts.length, 0);
  existingBatchId = null;
});
