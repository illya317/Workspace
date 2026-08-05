import assert from "node:assert/strict";
import { mock, test } from "node:test";

let voucherItemQueries = 0;
let allocationQueries = 0;
let balanceQueries = 0;
let exclusionQueries = 0;

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      financeVoucherItem: {
        findMany: async () => {
          voucherItemQueries += 1;
          return [
            { debit: 0, credit: 10, account: { code: "6001" }, voucher: { period: { month: 1 } } },
            { debit: 0, credit: 25, account: { code: "6001" }, voucher: { period: { month: 2 } } },
          ];
        },
      },
      financeCashFlowAllocation: {
        findMany: async () => {
          allocationQueries += 1;
          return [];
        },
      },
      financeAccountBalance: {
        findMany: async () => {
          balanceQueries += 1;
          return [];
        },
      },
      financeStatementVoucherExclusion: {
        findMany: async () => {
          exclusionQueries += 1;
          return [];
        },
      },
    },
  },
} as never);

const { computeIncomeMonthlySystemAmounts } = await import("./income-system-amounts");
const { computeCashFlowMonthlySystemAmounts } = await import("./cash-flow-system-amounts");

test("income monthly translation loads a company year once and groups facts by month", async () => {
  const rows = await computeIncomeMonthlySystemAmounts("C01", 2026, 2, [{
    lineCode: "revenue",
    label: "营业收入",
    section: "operating",
    side: "credit",
    isHeader: false,
    isTotal: false,
    isGrandTotal: false,
    prefixes: ["6001"],
    direction: "credit",
    subtract: false,
  }]);

  assert.equal(voucherItemQueries, 1);
  assert.equal(rows.get(1)?.get("revenue"), 10);
  assert.equal(rows.get(2)?.get("revenue"), 25);
});

test("cash-flow monthly translation uses three batched source queries for the whole year", async () => {
  const rows = await computeCashFlowMonthlySystemAmounts("C01", 2026, 6, []);

  assert.equal(allocationQueries, 1);
  assert.equal(balanceQueries, 1);
  assert.equal(exclusionQueries, 1);
  assert.equal(rows.size, 6);
});
