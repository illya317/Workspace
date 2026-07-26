import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { currentReverseBalanceAmount } from "./reverse-balance";

let auxiliaryRows: Array<{ periodId: number; accountId: number; closingDebit: number; closingCredit: number }> = [];
const adjustmentCreates: Array<Record<string, unknown>> = [];

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        financePeriod: {
          findMany: async () => [{ id: 12, companyCode: "ZX01", year: 2026, endDate: "2026-06-30", isClosed: false }],
        },
        financeAccount: {
          findMany: async () => [{ id: 100, companyCode: "ZX01", year: 2026, code: "2202", balanceDirection: "credit" }],
        },
        financeReclassRule: {
          findMany: async () => [{
            id: 9,
            policyVersionId: 1,
            sourceGroupAccountId: 20,
            targetGroupAccountId: 30,
            sourceAccountCode: "2202",
            abnormalSide: "debit",
            decision: "reclassify",
            basis: "counterparty_gross",
            targetAccountCode: "1123",
            enabled: true,
          }],
        },
        financeGroupAccountRevision: {
          findMany: async (args: { select: Record<string, boolean> }) => ("code" in args.select
            ? [{ policyVersionId: 1, groupAccountId: 30, code: "1123" }]
            : [{ groupAccountId: 20, parentGroupAccountId: null }, { groupAccountId: 30, parentGroupAccountId: null }]),
        },
        financeAccountBalance: {
          findMany: async () => [],
        },
        financeAuxiliaryBalance: {
          findMany: async () => auxiliaryRows,
        },
        financeBalanceReclassAdjustment: {
          findMany: async () => [],
          create: async (args: { data: Record<string, unknown> }) => {
            adjustmentCreates.push(args.data);
            return {};
          },
          update: async () => ({}),
          delete: async () => ({}),
        },
        financeBalanceReclassAdjustmentHistory: {
          create: async () => ({}),
        },
      }),
    },
  },
} as never);

mock.module("@workspace/platform/server/business-action-executor", {
  namedExports: {
    assertBusinessActionDirectExecutionAllowed: async () => ({ ok: true }),
  },
} as never);

mock.module("../group-accounts/resolve", {
  namedExports: {
    loadFinanceGroupAccountMapByAccountIdsAtInTransaction: async () => ({
      policyVersion: { id: 1, code: "V1" },
      mappings: new Map([[100, {
        id: 20,
        code: "2202",
        name: "应付账款",
        category: "liability",
        balanceDirection: "credit",
        parentId: null,
      }]]),
    }),
  },
} as never);

const { saveBalanceReclassAdjustmentChangeSet } = await import("./adjustments");

test("computes the current reverse balance for both natural directions", () => {
  assert.equal(currentReverseBalanceAmount({
    closingDebit: 0,
    closingCredit: 125.236,
    account: { balanceDirection: "debit" },
  }), 125.24);
  assert.equal(currentReverseBalanceAmount({
    closingDebit: 80,
    closingCredit: 0,
    account: { balanceDirection: "credit" },
  }), 80);
  assert.equal(currentReverseBalanceAmount({
    closingDebit: 0,
    closingCredit: 0.01,
    account: { balanceDirection: "debit" },
  }), 0.01);
});

test("rejects zero and natural-side balances", () => {
  assert.equal(currentReverseBalanceAmount({
    closingDebit: 125,
    closingCredit: 0,
    account: { balanceDirection: "debit" },
  }), null);
  assert.equal(currentReverseBalanceAmount({
    closingDebit: 0,
    closingCredit: 0,
    account: { balanceDirection: "credit" },
  }), null);
});

test("rejects a gross-basis manual reclassification without auxiliary facts", async () => {
  auxiliaryRows = [];
  adjustmentCreates.length = 0;
  const result = await saveBalanceReclassAdjustmentChangeSet({
    userId: 1,
    changes: [{
      operation: "manual",
      periodId: 12,
      sourceAccountCode: "2202",
      decision: "reclassify",
      targetAccountCode: "1123",
    }],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.match(result.error, /往来户逐户口径/);
  assert.match(result.error, /无辅助余额事实/);
  assert.deepEqual(adjustmentCreates, []);
});

test("saves a gross-basis manual reclassification from counterparty facts", async () => {
  auxiliaryRows = [
    { periodId: 12, accountId: 100, closingDebit: 300, closingCredit: 0 },
    { periodId: 12, accountId: 100, closingDebit: 0, closingCredit: 120 },
  ];
  adjustmentCreates.length = 0;
  const result = await saveBalanceReclassAdjustmentChangeSet({
    userId: 1,
    changes: [{
      operation: "manual",
      periodId: 12,
      sourceAccountCode: "2202",
      decision: "reclassify",
      targetAccountCode: "1123",
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(adjustmentCreates.length, 1);
  assert.equal(adjustmentCreates[0]?.basis, "counterparty_gross");
  assert.equal(adjustmentCreates[0]?.amount, 300);
  assert.equal(adjustmentCreates[0]?.sourceType, "manual");
});

test("keeps a gross-basis manual no-process decision at zero without auxiliary facts", async () => {
  auxiliaryRows = [];
  adjustmentCreates.length = 0;
  const result = await saveBalanceReclassAdjustmentChangeSet({
    userId: 1,
    changes: [{
      operation: "manual",
      periodId: 12,
      sourceAccountCode: "2202",
      decision: "no_reclass",
      targetAccountCode: null,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(adjustmentCreates.length, 1);
  assert.equal(adjustmentCreates[0]?.basis, "counterparty_gross");
  assert.equal(adjustmentCreates[0]?.amount, 0);
});
