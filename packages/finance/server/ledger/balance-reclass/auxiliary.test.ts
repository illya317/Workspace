import assert from "node:assert/strict";
import test from "node:test";

import type { PreviewAuxiliaryBalance } from "../../import/shared";
import { buildAuxiliaryReclassEntries } from "./auxiliary";

test("reclassifies only opposite-side auxiliary closing balances in supported pairs", () => {
  const rows = [
    row("2202", "supplier", "0048", "供应商A", 2060, 0),
    row("2202", "supplier", "0080", "供应商B", 5460, 0),
    row("2202", "supplier", "0084", "供应商C", 5000, 0),
    row("224101", "supplier", "0006", "单位A", 45581.2, 0),
    row("224101", "supplier", "0024", "单位B", 5500, 0),
    row("122101", "customer", "0007", "单位C", 0, 58913072.19),
    row("1123", "supplier", "0001", "正常预付", 100, 0),
    row("2221", "supplier", "tax", "应交税费", 192617.25, 0),
  ];

  const result = buildAuxiliaryReclassEntries(rows);
  assert.deepEqual(result.coveredAccountCodes.sort(), ["1123", "122101", "2202", "224101"]);
  assert.deepEqual(
    result.entries.map((entry) => ({
      sourceAccount: entry.sourceAccount,
      targetAccount: entry.targetAccount,
      amount: entry.amount,
      count: entry.details.length,
    })),
    [
      { sourceAccount: "2202", targetAccount: "1123", amount: 12520, count: 3 },
      { sourceAccount: "224101", targetAccount: "122101", amount: 51081.2, count: 2 },
      { sourceAccount: "122101", targetAccount: "224101", amount: 58913072.19, count: 1 },
    ],
  );
});

test("nets debit and credit before deciding the closing side", () => {
  const result = buildAuxiliaryReclassEntries([
    { ...row("2202", "supplier", "1", "供应商", 120, 20) },
    { ...row("122101", "customer", "2", "客户", 30, 80) },
  ]);
  assert.deepEqual(result.entries.map((entry) => entry.amount), [100, 50]);
});

function row(
  accountCode: string,
  dimensionType: PreviewAuxiliaryBalance["dimensionType"],
  dimensionCode: string,
  dimensionName: string,
  closingDebit: number,
  closingCredit: number,
): PreviewAuxiliaryBalance {
  return {
    accountCode,
    accountName: accountCode,
    dimensionType,
    dimensionCode,
    dimensionName,
    openingDebit: 0,
    openingCredit: 0,
    currentDebit: 0,
    currentCredit: 0,
    closingDebit,
    closingCredit,
  };
}
