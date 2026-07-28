import assert from "node:assert/strict";
import { mock, test } from "node:test";

const reportCalls: Array<{ year?: number; month?: number }> = [];
const closingByMonth = new Map([
  [1, 110],
  [2, 118],
  [3, 130],
  [4, 125],
  [5, 150],
  [6, 170],
]);
const netProfitByMonth = new Map([
  [1, 10],
  [2, 5],
  [3, 12],
  [4, -5],
  [5, 20],
  [6, 5],
]);

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      financePeriod: {
        findMany: async () => Array.from({ length: 6 }, (_, index) => ({ year: 2026, month: index + 1 })),
      },
    },
  },
});
mock.module("./report-generator", {
  namedExports: {
    generateFinanceReport: async (request: { year?: number; month?: number }) => {
      reportCalls.push(request);
      const amount = request.year === 2025 ? 100 : closingByMonth.get(request.month ?? 0);
      return Response.json({ equity: [{ lineCode: "undistributedProfit", amount }] });
    },
  },
});
mock.module("./reports/direct", {
  namedExports: {
    generateDirectStatementReport: async (_companyCode: string, _year: number, month: number) => ({
      lines: [{ lineCode: "netProfit", currentMonthAmount: netProfitByMonth.get(month) }],
    }),
  },
});

const { generateFrozenEquityRollforward } = await import("./consolidation-equity-rollforward");

const policy = {
  openingDate: "2025-12-31",
  openingRetainedEarningsCny: 600,
  evidence: "Approved 2025-12-31 CNY retained earnings",
};

test("opening rollforward reads December CAD from the ledger and rolls every 2026 month", async () => {
  const result = await generateFrozenEquityRollforward("EX-CAD", 2026, 6, policy);
  assert.ok(reportCalls.some((call) => call.year === 2025 && call.month === 12));
  assert.equal(result.seed.originalAmount, 100);
  assert.equal(result.seed.openingRetainedEarningsCny, 600);
  assert.equal(result.periods.length, 6);
  assert.deepEqual(result.periods.map((period) => period.otherAdjustmentOriginalAmount), [0, 3, 0, 0, 5, 15]);
  assert.equal(result.periods.at(-1)?.closingOriginalAmount, 170);
});

test("opening rollforward rejects a baseline that is not the report's prior year-end", async () => {
  await assert.rejects(
    () => generateFrozenEquityRollforward("EX-CAD", 2026, 6, { ...policy, openingDate: "2024-12-31" }),
    /必须为报表上年末 2025-12-31/,
  );
});
