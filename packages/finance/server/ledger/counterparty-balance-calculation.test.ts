import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateMonthlyCounterpartyBalances,
  rollForwardHistoricalCounterpartyBalances,
  totalCounterpartyBalances,
  type CounterpartyBalanceFact,
} from "./counterparty-balance-calculation";

const person = {
  id: 7,
  dimensionType: "person",
  sourceCode: "007",
  sourceName: "张三",
  shortName: null,
};
const department = {
  id: 9,
  dimensionType: "department",
  sourceCode: "D01",
  sourceName: "财务部",
  shortName: null,
};

test("groups a multi-auxiliary other-payable balance by person without duplicating amounts", () => {
  const facts: CounterpartyBalanceFact[] = [
    balanceFact("1", [department, person], 0, 100, 20, 5),
    balanceFact("2", [person, department], 0, 50, 10, 0),
  ];

  const rows = aggregateMonthlyCounterpartyBalances(facts, "otherAp");

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.counterpartyName, "张三");
  assert.deepEqual(amounts(rows[0]!), {
    openingDebit: 0,
    openingCredit: 150,
    currentDebit: 30,
    currentCredit: 5,
    closingDebit: 0,
    closingCredit: 125,
  });
});

test("uses the locked TPlus canonical type instead of the raw generic customer slot", () => {
  const supplier = {
    id: 18,
    dimensionType: "customer",
    canonicalType: "supplier",
    sourceCode: "P018",
    sourceName: "供应商甲",
    shortName: "供应商甲",
  };

  const rows = aggregateMonthlyCounterpartyBalances([
    { ...balanceFact("3", [supplier], 0, 80, 0, 0), accountCode: "2202", accountName: "应付账款" },
  ], "ap");

  assert.equal(rows[0]?.counterpartyType, "supplier");
  assert.equal(rows[0]?.counterpartyName, "供应商甲");
});

test("omits auxiliary members with no opening balance or period activity", () => {
  const rows = aggregateMonthlyCounterpartyBalances([
    balanceFact("zero", [person], 0, 0, 0, 0),
  ], "otherAp");

  assert.deepEqual(rows, []);
});

test("rolls historical TPlus opening balances through prior and selected-month vouchers", () => {
  const customer = {
    id: 20,
    dimensionType: "customer",
    canonicalType: "customer",
    sourceCode: "C020",
    sourceName: "客户乙",
    shortName: "客户乙",
  };
  const opening = [{ ...balanceFact("4", [customer], 100, 0, 0, 0), accountCode: "1122", accountName: "应收账款" }];
  const vouchers = [
    { sourceId: "v1", month: 1, accountId: 11, accountCode: "1122", accountName: "应收账款", members: [customer], debit: 0, credit: 20 },
    { sourceId: "v2", month: 2, accountId: 11, accountCode: "1122", accountName: "应收账款", members: [customer], debit: 30, credit: 10 },
    { sourceId: "v3", month: 3, accountId: 11, accountCode: "1122", accountName: "应收账款", members: [customer], debit: 999, credit: 0 },
  ];

  const rows = rollForwardHistoricalCounterpartyBalances(opening, vouchers, "ar", 2);

  assert.deepEqual(amounts(rows[0]!), {
    openingDebit: 80,
    openingCredit: 0,
    currentDebit: 30,
    currentCredit: 10,
    closingDebit: 100,
    closingCredit: 0,
  });
  assert.deepEqual(totalCounterpartyBalances(rows), amounts(rows[0]!));
});

function balanceFact(
  sourceId: string,
  members: CounterpartyBalanceFact["members"],
  openingDebit: number,
  openingCredit: number,
  currentDebit: number,
  currentCredit: number,
): CounterpartyBalanceFact {
  return {
    sourceId,
    accountId: 11,
    accountCode: "224102",
    accountName: "其他应付款-个人",
    members,
    openingDebit,
    openingCredit,
    currentDebit,
    currentCredit,
  };
}

function amounts(row: {
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
}) {
  return {
    openingDebit: row.openingDebit,
    openingCredit: row.openingCredit,
    currentDebit: row.currentDebit,
    currentCredit: row.currentCredit,
    closingDebit: row.closingDebit,
    closingCredit: row.closingCredit,
  };
}
