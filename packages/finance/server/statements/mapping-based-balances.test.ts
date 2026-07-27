import assert from "node:assert/strict";
import test, { mock } from "node:test";

const balanceRows = [
  {
    openingDebit: 0,
    openingCredit: 0,
    closingDebit: 80,
    closingCredit: 0,
    account: {
      id: 1,
      code: "660112",
      name: "其他",
      category: "expense",
      parentId: null,
    },
  },
  {
    openingDebit: 0,
    openingCredit: 0,
    closingDebit: 12,
    closingCredit: 0,
    account: {
      id: 2,
      code: "777777",
      name: "未映射资产",
      category: "asset",
      parentId: null,
    },
  },
];
let exclusionRows: Array<{
  voucher: { items: Array<{ debit: number; credit: number; account: { code: string; category: string } }> };
}> = [];
let supplementalRows: Array<{
  debit: number;
  credit: number;
  account: { code: string; category: string };
}> = [];

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      financePeriod: { findFirst: async () => ({ id: 1 }) },
      financeAccountBalance: { findMany: async () => balanceRows },
      financeAccount: {
        findMany: async () => balanceRows.map((row) => ({
          code: row.account.code,
          parent: null,
        })),
      },
      financeBalanceSnapshot: { findFirst: async () => ({ year: 2024 }) },
      financeVoucherItem: { findMany: async () => supplementalRows },
      financeStatementVoucherExclusion: { findMany: async () => exclusionRows },
    },
  },
} as never);

const { aggregateMappingBasedBalances } = await import("./mapping-based-balances");

test("presents an unclosed expense residual through undistributed profit", async () => {
  exclusionRows = [];
  supplementalRows = [];
  const result = await aggregateMappingBasedBalances("02", 2026, 7);
  const retainedEarnings = result.byLineCode.find((line) => line.lineCode === "undistributedProfit");

  assert.deepEqual(retainedEarnings, {
    lineCode: "undistributedProfit",
    debit: 80,
    credit: 0,
    net: 80,
    accountCodes: ["660112"],
  });
  assert.deepEqual(result.profitOrLossCarryforward, [{
    accountCode: "660112",
    accountName: "其他",
    category: "expense",
    debit: 80,
    credit: 0,
    net: 80,
  }]);
  assert.deepEqual(result.unresolved.map((account) => account.accountCode), ["777777"]);
  assert.equal(result.resolvedCount, 1);
});

test("reverses an explicitly excluded voucher from balance-sheet presentation only", async () => {
  supplementalRows = [];
  exclusionRows = [{
    voucher: {
      items: [{ debit: 80, credit: 0, account: { code: "660112", category: "expense" } }],
    },
  }];

  const result = await aggregateMappingBasedBalances("02", 2026, 7);
  const retainedEarnings = result.byLineCode.find((line) => line.lineCode === "undistributedProfit");

  assert.equal(retainedEarnings?.net, 0);
});

test("adds pre-baseline Workspace supplements without mutating ERP balances", async () => {
  exclusionRows = [];
  supplementalRows = [
    { debit: 505_060, credit: 0, account: { code: "1511", category: "asset" } },
    { debit: 0, credit: 505_060, account: { code: "2241", category: "liability" } },
  ];

  const result = await aggregateMappingBasedBalances("02", 2026, 6);

  assert.equal(result.byLineCode.find((line) => line.lineCode === "longTermInvest")?.net, 505_060);
  assert.equal(result.byLineCode.find((line) => line.lineCode === "otherPayables")?.net, -505_060);
});
