import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinanceBalanceCutoverReplay,
  type FinanceBalanceCutoverReplayAccount,
  type FinanceBalanceCutoverReplayFacts,
  type FinanceBalanceCutoverReplaySourceRow,
} from "./balance-cutover-replay";

const scope = { companyCode: "01", year: 2026, month: 6 };

test("replays June source openings plus posted vouchers without using source closing as input", () => {
  const facts = fixture();
  facts.vouchers.push({
    id: 99,
    voucherNo: "ARCHIVED",
    status: "archived",
    companyCode: "other-company-is-ignored",
    totalDebit: 999,
    totalCredit: 999,
    items: [{
      id: 999,
      accountId: 999,
      debit: 999,
      credit: 0,
      account: account({ id: 999, code: "9999", companyCode: "other-company-is-ignored" }),
    }],
  });

  const result = buildFinanceBalanceCutoverReplay(scope, facts);

  assert.equal(result.ready, true);
  assert.equal(result.sourceInput.openingRowCount, 3);
  assert.equal(result.vouchers.postedVoucherCount, 1);
  assert.equal(result.vouchers.postedItemCount, 2);
  assert.deepEqual(result.vouchers.ignoredStatusCounts, { archived: 1 });
  assert.deepEqual(
    result.derived.balances.map((row) => ({
      code: row.accountCode,
      openingDebit: row.openingDebit,
      openingCredit: row.openingCredit,
      currentDebit: row.currentDebit,
      currentCredit: row.currentCredit,
      closingDebit: row.closingDebit,
      closingCredit: row.closingCredit,
    })),
    [
      { code: "1000", openingDebit: 100, openingCredit: 0, currentDebit: 20, currentCredit: 0, closingDebit: 120, closingCredit: 0 },
      { code: "1001", openingDebit: 100, openingCredit: 0, currentDebit: 20, currentCredit: 0, closingDebit: 120, closingCredit: 0 },
      { code: "2001", openingDebit: 0, openingCredit: 0, currentDebit: 0, currentCredit: 20, closingDebit: 0, closingCredit: 20 },
    ],
  );
  assert.equal(result.sourceComparison.differenceCount, 0);
  assert.equal(result.cacheComparison.differenceCount, 0);
});

test("produces a deterministic fingerprint independent of query ordering", () => {
  const left = fixture();
  const right = fixture();
  right.accounts.reverse();
  right.sourceBalances.reverse();
  right.cachedBalances.reverse();
  right.vouchers.reverse();
  right.vouchers[0]!.items.reverse();

  assert.equal(
    buildFinanceBalanceCutoverReplay(scope, left).fingerprint,
    buildFinanceBalanceCutoverReplay(scope, right).fingerprint,
  );
});

test("reports exact source and cache differences without changing the derived rows", () => {
  const facts = fixture();
  facts.sourceBalances[0]!.closingDebit = 121;
  facts.cachedBalances[1]!.currentDebit = 21;

  const result = buildFinanceBalanceCutoverReplay(scope, facts);

  assert.equal(result.ready, false);
  assert.deepEqual(result.sourceComparison.differences, [{
    accountId: 1,
    accountCode: "1000",
    accountName: "资产",
    field: "closingDebit",
    derivedValue: 120,
    actualValue: 121,
    difference: 1,
  }]);
  assert.deepEqual(result.cacheComparison.differences, [{
    accountId: 2,
    accountCode: "1001",
    accountName: "银行存款",
    field: "currentDebit",
    derivedValue: 20,
    actualValue: 21,
    difference: 1,
  }]);
});

test("uses the account direction when current activity crosses the opening side", () => {
  const facts = fixture();
  facts.sourceBalances[2]!.openingCredit = 10;
  facts.sourceBalances[2]!.closingCredit = 30;
  facts.cachedBalances[2]!.openingCredit = 10;
  facts.cachedBalances[2]!.closingCredit = 30;

  const result = buildFinanceBalanceCutoverReplay(scope, facts);
  const liability = result.derived.balances.find((row) => row.accountCode === "2001");

  assert.deepEqual(liability, {
    accountId: 3,
    accountCode: "2001",
    accountName: "应付账款",
    openingDebit: 0,
    openingCredit: 10,
    currentDebit: 0,
    currentCredit: 20,
    closingDebit: 0,
    closingCredit: 30,
  });
});

test("fails closed when one account has ambiguous source opening rows", () => {
  const facts = fixture();
  facts.sourceBalances.push({ ...facts.sourceBalances[0]!, id: 91, sourceKey: "duplicate" });

  assert.throws(
    () => buildFinanceBalanceCutoverReplay(scope, facts),
    /存在多行，切换输入不唯一/,
  );
});

test("fails closed when a posted voucher references a cross-scope account", () => {
  const facts = fixture();
  facts.vouchers[0]!.items[0]!.account.companyCode = "02";

  assert.throws(
    () => buildFinanceBalanceCutoverReplay(scope, facts),
    /引用停用、跨公司或错年度科目/,
  );
});

test("fails closed when source rows come from more than one import batch", () => {
  const facts = fixture();
  facts.sourceBalances[1]!.importId = 42;
  facts.sourceBalances[1]!.import.id = 42;

  assert.throws(
    () => buildFinanceBalanceCutoverReplay(scope, facts),
    /跨多个导入批次/,
  );
});

function fixture(): FinanceBalanceCutoverReplayFacts {
  const accounts = [
    account({ id: 1, code: "1000", name: "资产" }),
    account({ id: 2, code: "1001", name: "银行存款", parentId: 1 }),
    account({ id: 3, code: "2001", name: "应付账款", balanceDirection: "credit" }),
  ];
  const sourceBalances = [
    sourceRow(accounts[0]!, { openingDebit: 100, currentDebit: 20, closingDebit: 120 }),
    sourceRow(accounts[1]!, { openingDebit: 100, currentDebit: 20, closingDebit: 120 }),
    sourceRow(accounts[2]!, { currentCredit: 20, closingCredit: 20 }),
  ];
  return {
    period: {
      id: 1273,
      companyCode: scope.companyCode,
      year: scope.year,
      month: scope.month,
      endDate: "2026-06-30",
      sourceSystem: "T6",
      sourceDatabase: "UFDATA_001_2026",
    },
    accounts,
    sourceBalances,
    cachedBalances: sourceBalances.map((row) => ({
      id: row.id + 100,
      accountId: row.accountId,
      openingDebit: row.openingDebit,
      openingCredit: row.openingCredit,
      currentDebit: row.currentDebit,
      currentCredit: row.currentCredit,
      closingDebit: row.closingDebit,
      closingCredit: row.closingCredit,
      account: { ...row.account },
    })),
    vouchers: [{
      id: 11,
      voucherNo: "2026-06-记-0001",
      status: "posted",
      companyCode: scope.companyCode,
      totalDebit: 20,
      totalCredit: 20,
      items: [
        { id: 111, accountId: 2, debit: 20, credit: 0, account: { ...accounts[1]! } },
        { id: 112, accountId: 3, debit: 0, credit: 20, account: { ...accounts[2]! } },
      ],
    }],
  };
}

function account(
  overrides: Partial<FinanceBalanceCutoverReplayAccount> & Pick<FinanceBalanceCutoverReplayAccount, "id" | "code">,
): FinanceBalanceCutoverReplayAccount {
  return {
    name: overrides.code,
    parentId: null,
    balanceDirection: "debit",
    companyCode: scope.companyCode,
    year: scope.year,
    isActive: true,
    ...overrides,
  };
}

function sourceRow(
  accountValue: FinanceBalanceCutoverReplayAccount,
  amounts: Partial<Pick<FinanceBalanceCutoverReplaySourceRow,
    "openingDebit" | "openingCredit" | "currentDebit" | "currentCredit" | "closingDebit" | "closingCredit">>,
): FinanceBalanceCutoverReplaySourceRow {
  return {
    id: accountValue.id,
    importId: 41,
    accountId: accountValue.id,
    companyCode: scope.companyCode,
    sourceSystem: "T6",
    sourceDatabase: "UFDATA_001_2026",
    sourceKey: `balance:${accountValue.code}`,
    openingDebit: 0,
    openingCredit: 0,
    currentDebit: 0,
    currentCredit: 0,
    closingDebit: 0,
    closingCredit: 0,
    ...amounts,
    account: { ...accountValue },
    import: {
      id: 41,
      status: "completed",
      batchKey: "finance-readable:T6:UFDATA_001_2026:2026",
      sourceSystem: "T6",
      sourceDatabase: "UFDATA_001_2026",
      cutoffDate: "2026-06-30",
      checksum: "fixture-checksum",
    },
  };
}
