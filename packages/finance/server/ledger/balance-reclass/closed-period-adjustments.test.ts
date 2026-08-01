import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

const creates: Array<Record<string, unknown>> = [];

mockModule("@workspace/platform/server/api", {
  namedExports: {
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
    serviceOk: (data: unknown) => ({ ok: true, data }),
  },
});
mockModule("@workspace/platform/server/business-action-executor", {
  namedExports: { assertBusinessActionDirectExecutionAllowed: async () => ({ ok: true }) },
});
mockModule("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      $transaction: async (run: (tx: Record<string, unknown>) => Promise<unknown>) => run({
        financePeriod: {
          findMany: async () => [{ id: 7, companyCode: "ZX01", year: 2026, endDate: "2026-06-30", isClosed: true }],
        },
        financeAccount: {
          findMany: async () => [
            { id: 10, companyCode: "ZX01", year: 2026, code: "22210103", balanceDirection: "credit" },
            { id: 11, companyCode: "ZX01", year: 2026, code: "11220103", balanceDirection: "debit" },
          ],
        },
        financeAccountBalance: {
          findMany: async () => [{
            periodId: 7,
            closingDebit: 100,
            closingCredit: 0,
            account: { code: "22210103", balanceDirection: "credit" },
          }],
        },
        financeGroupAccountRevision: {
          findMany: async () => [{ policyVersionId: 1, groupAccountId: 30, code: "11220103" }],
        },
        financeReclassRule: {
          findMany: async () => [],
        },
        financeBalanceReclassAdjustment: {
          findMany: async () => [],
          create: async (args: Record<string, unknown>) => { creates.push(args); },
        },
      }),
    },
  },
});
mockModule("../validation", {
  namedExports: {
    buildSaveBalanceReclassAdjustmentChangeSetCommand: (input: unknown) => ({ ok: true, data: { input } }),
  },
});
mockModule("./reverse-balance", {
  namedExports: { currentReverseBalanceAmount: () => 100 },
});
mockModule("./automatic", {
  namedExports: { materializeAutomaticRuleAdjustments: async () => ({ written: 0, updated: 0, deleted: 0, skippedProtected: 0 }) },
});
mockModule("./history", {
  namedExports: {
    archiveBalanceReclassAdjustment: async () => undefined,
    hasSameBalanceReclassResult: () => false,
  },
});
mockModule("../group-accounts/resolve", {
  namedExports: {
    loadFinanceGroupAccountMapByAccountIdsAtInTransaction: async () => ({
      policyVersion: { id: 1, versionNo: 1, code: "V1", effectiveFrom: null, effectiveTo: null },
      mappings: new Map([[10, {
        id: 20,
        code: "22210103",
        name: "应交增值税",
        category: "liability",
        balanceDirection: "credit",
        parentId: null,
      }]]),
    }),
  },
});

const { saveBalanceReclassAdjustmentChangeSet } = await import("./adjustments");

test("closed periods accept report-only reclassification adjustments", async () => {
  creates.length = 0;
  const result = await saveBalanceReclassAdjustmentChangeSet({
    userId: 9,
    changes: [{
      operation: "manual",
      periodId: 7,
      sourceAccountCode: "22210103",
      decision: "reclassify",
      targetAccountCode: "11220103",
    }],
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      success: true,
      saved: 1,
      restored: 0,
      unchanged: 0,
      automatic: { written: 0, updated: 0, deleted: 0, skippedProtected: 0 },
    },
  });
  assert.equal(creates.length, 1);
  assert.equal((creates[0]?.data as { decision?: string })?.decision, "reclassify");
  assert.equal((creates[0]?.data as { sourceType?: string })?.sourceType, "manual");
});
