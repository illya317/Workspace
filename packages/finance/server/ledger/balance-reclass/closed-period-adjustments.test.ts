import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

const upserts: Array<Record<string, unknown>> = [];

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
          findMany: async () => [{ id: 7, companyCode: "01", year: 2026, isClosed: true }],
        },
        financeAccount: {
          findMany: async () => [
            { id: 10, companyCode: "01", year: 2026, code: "22210103", balanceDirection: "credit" },
            { id: 11, companyCode: "01", year: 2026, code: "11220103", balanceDirection: "debit" },
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
        financeBalanceReclassAdjustment: {
          upsert: async (args: Record<string, unknown>) => { upserts.push(args); },
        },
      }),
    },
  },
});
mockModule("../../domain/finance-validation", {
  namedExports: {
    buildSaveBalanceReclassAdjustmentChangeSetCommand: (input: unknown) => ({ ok: true, data: { input } }),
  },
});
mockModule("./reverse-balance", {
  namedExports: { currentReverseBalanceAmount: () => 100 },
});

const { saveBalanceReclassAdjustmentChangeSet } = await import("./adjustments");

test("closed periods accept report-only reclassification adjustments", async () => {
  upserts.length = 0;
  const result = await saveBalanceReclassAdjustmentChangeSet({
    userId: 9,
    changes: [{ periodId: 7, sourceAccountCode: "22210103", targetAccountCode: "11220103" }],
  });

  assert.deepEqual(result, { ok: true, data: { success: true, saved: 1 } });
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0]?.where, {
    periodId_sourceAccountCode: { periodId: 7, sourceAccountCode: "22210103" },
  });
});
