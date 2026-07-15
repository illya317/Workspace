import assert from "node:assert/strict";
import test from "node:test";

import type { PreviewAuxiliaryBalance } from "../../import/shared";
import { buildAuxiliaryReclassEntries } from "./auxiliary";

test("does not reclassify auxiliary balances before a manual decision is stored", () => {
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
  assert.deepEqual(result.coveredAccountCodes, []);
  assert.deepEqual(result.entries, []);
});

test("applies a manually confirmed rule to child accounts", () => {
  const result = buildAuxiliaryReclassEntries([
    row("220299", "supplier", "1", "供应商", 100, 0),
    row("22410199", "supplier", "2", "单位", 80, 0),
  ], [rule(1, "2202", "debit", "1123")]);
  assert.deepEqual(result.entries.map((entry) => [entry.sourceAccount, entry.targetAccount]), [["220299", "1123"]]);
});

test("nets debit and credit before deciding the closing side", () => {
  const result = buildAuxiliaryReclassEntries([
    { ...row("2202", "supplier", "1", "供应商", 120, 20) },
    { ...row("122101", "customer", "2", "客户", 30, 80) },
  ], [rule(1, "2202", "debit", "1123"), rule(2, "122101", "credit", "224101")]);
  assert.deepEqual(result.entries.map((entry) => entry.amount), [100, 50]);
});

test("manual rules use closing net balance rather than current movements", () => {
  const result = buildAuxiliaryReclassEntries([
    { ...row("2202", "supplier", "1", "供应商", 120, 20), currentDebit: 9999 },
  ], [rule(7, "2202", "debit", "1463")]);
  assert.deepEqual(result.entries.map((entry) => ({ target: entry.targetAccount, amount: entry.amount, ruleId: entry.ruleId })), [
    { target: "1463", amount: 100, ruleId: 7 },
  ]);
});

test("a manual no-reclassification decision covers the account without creating an adjustment", () => {
  const result = buildAuxiliaryReclassEntries([
    row("2202", "supplier", "1", "供应商", 100, 0),
  ], [{ id: 8, sourceAccountCode: "2202", abnormalSide: "debit", decision: "no_reclass", targetAccountCode: null, enabled: true }]);
  assert.deepEqual(result.coveredAccountCodes, ["2202"]);
  assert.deepEqual(result.entries, []);
});

function rule(id: number, sourceAccountCode: string, abnormalSide: string, targetAccountCode: string) {
  return { id, sourceAccountCode, abnormalSide, decision: "reclassify", targetAccountCode, enabled: true };
}

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
