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
      financeStatementVoucherExclusion: { findMany: async () => exclusionRows },
    },
  },
} as never);

const { aggregateMappingBasedBalances } = await import("./mapping-based-balances");

test("presents an unclosed expense residual through undistributed profit", async () => {
  exclusionRows = [];
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
  exclusionRows = [{
    voucher: {
      items: [{ debit: 80, credit: 0, account: { code: "660112", category: "expense" } }],
    },
  }];

  const result = await aggregateMappingBasedBalances("02", 2026, 7);
  const retainedEarnings = result.byLineCode.find((line) => line.lineCode === "undistributedProfit");

  assert.equal(retainedEarnings?.net, 0);
});
