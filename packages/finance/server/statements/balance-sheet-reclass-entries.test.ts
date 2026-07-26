import assert from "node:assert/strict";
import test, { mock } from "node:test";

const adjustmentQueries: Array<{ where: { periodId: number } }> = [];

const rowsByPeriod = new Map<number, Array<{
  sourceAccountCode: string;
  targetAccountCode: string;
  amount: number;
}>>([
  [6, [{ sourceAccountCode: "2221", targetAccountCode: "1463", amount: 80 }]],
  [7, [{ sourceAccountCode: "2221", targetAccountCode: "1463", amount: 90 }]],
  [12, [{ sourceAccountCode: "1221", targetAccountCode: "2241", amount: 30 }]],
  [13, [{ sourceAccountCode: "1221", targetAccountCode: "2241", amount: 40 }]],
  [3, [{ sourceAccountCode: "2202", targetAccountCode: "1123", amount: 50 }]],
  [106, [{ sourceAccountCode: "2202", targetAccountCode: "1123", amount: 60 }]],
  [112, [{ sourceAccountCode: "2202", targetAccountCode: "1123", amount: 70 }]],
]);

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      financePeriod: {
        findFirst: async (args: { where: { companyCode: string; year: number; month: number } }) => {
          if (args.where.year === 2026 && args.where.month === 6) return { id: 6 };
          if (args.where.year === 2026 && args.where.month === 3) return { id: 3 };
          if (args.where.year === 2025 && args.where.month === 12) return { id: 12 };
          return null;
        },
      },
      financeBalanceReclassAdjustment: {
        findMany: async (args: { where: { periodId: number } }) => {
          adjustmentQueries.push(args);
          return rowsByPeriod.get(args.where.periodId) ?? [];
        },
      },
    },
  },
} as never);

const {
  loadBalanceSheetPeriodReclassEntries,
} = await import("./balance-sheet-reclass-entries");

test("July comparative consumes prior year-end reclassification while closing consumes July", async () => {
  adjustmentQueries.length = 0;
  const result = await loadBalanceSheetPeriodReclassEntries({
    id: 7,
    companyCode: "ZX01",
    year: 2026,
    month: 7,
  });

  assert.deepEqual(result, {
    closing: [{ sourceAccount: "2221", targetAccount: "1463", amount: 90 }],
    opening: [{ sourceAccount: "1221", targetAccount: "2241", amount: 30 }],
  });
  assert.deepEqual(adjustmentQueries.map((query) => query.where.periodId), [7, 12]);
});

test("January opening crosses the year boundary to prior December", async () => {
  const result = await loadBalanceSheetPeriodReclassEntries({
    id: 13,
    companyCode: "ZX01",
    year: 2026,
    month: 1,
  });

  assert.deepEqual(result, {
    closing: [{ sourceAccount: "1221", targetAccount: "2241", amount: 40 }],
    opening: [{ sourceAccount: "1221", targetAccount: "2241", amount: 30 }],
  });
});

test("quarter comparative consumes the prior year-end reclassification", async () => {
  const result = await loadBalanceSheetPeriodReclassEntries({
    id: 106,
    companyCode: "ZX01",
    year: 2026,
    month: 6,
  });

  assert.deepEqual(result, {
    closing: [{ sourceAccount: "2202", targetAccount: "1123", amount: 60 }],
    opening: [{ sourceAccount: "1221", targetAccount: "2241", amount: 30 }],
  });
});

test("annual comparative consumes the prior year-end reclassification", async () => {
  const result = await loadBalanceSheetPeriodReclassEntries({
    id: 112,
    companyCode: "ZX01",
    year: 2026,
    month: 12,
  });

  assert.deepEqual(result, {
    closing: [{ sourceAccount: "2202", targetAccount: "1123", amount: 70 }],
    opening: [{ sourceAccount: "1221", targetAccount: "2241", amount: 30 }],
  });
});
