import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";

import { buildNonControllingInterestEntries } from "./consolidation-nci-entries";

const groupAccounts = {
  balanceSheet: { groupAccountId: 2275, accountCode: "410401" },
  incomeStatement: { groupAccountId: 2127, accountCode: "4103" },
};

function batch(input: {
  shareRatio?: number;
  currency?: "CNY" | "CAD";
  currentRate?: number;
  comparativeRate?: number;
} = {}) {
  const shareRatio = input.shareRatio ?? 0.75;
  const currency = input.currency ?? "CNY";
  return {
    entities: [{
      id: 1, companyId: 11, companyCode: "P01", companyName: "母公司", role: "parent",
      directParentCompanyId: null, shareRatio: 1, isConsolidated: true, functionalCurrency: "CNY",
    }, {
      id: 2, companyId: 22, companyCode: "S01", companyName: "子公司", role: "subsidiary",
      directParentCompanyId: 11, shareRatio, isConsolidated: true, functionalCurrency: currency,
    }],
    sources: [{
      entitySnapshotId: 2,
      reportType: "balanceSheet",
      reportPayload: { payload: { assets: [], liabilities: [], equity: [{
        lineCode: "totalEquity", amount: -400, previousAmount: -300,
      }] } },
    }, {
      entitySnapshotId: 2,
      reportType: "incomeStatement",
      reportPayload: { payload: { lines: [{
        lineCode: "netProfit", amount: -80, previousAmount: -60,
      }] } },
    }],
    exchangeRates: currency === "CNY" ? [] : [{
      id: 10, baseCurrency: "CAD", quoteCurrency: "CNY", rate: input.currentRate ?? 5,
      applications: [{ applicationType: "closing", periodBasis: "current", entitySnapshotId: 2 }],
    }, {
      id: 11, baseCurrency: "CAD", quoteCurrency: "CNY", rate: input.comparativeRate ?? 4,
      applications: [{ applicationType: "closing", periodBasis: "comparative", entitySnapshotId: 2 }],
    }],
  } as ConsolidationBatchSnapshot;
}

test("allocates minority net assets and profit without changing consolidated totals", () => {
  const result = buildNonControllingInterestEntries(batch(), groupAccounts);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]?.entryType, "nonControllingInterest");
  assert.deepEqual(result.data[0]?.lines.map((line) => [
    line.statementType, line.periodBasis, line.lineCode, line.debit, line.credit,
  ]), [
    ["balanceSheet", "current", "nonControllingInterests", 100, 0],
    ["balanceSheet", "current", "undistributedProfit", 0, 100],
    ["balanceSheet", "comparative", "nonControllingInterests", 75, 0],
    ["balanceSheet", "comparative", "undistributedProfit", 0, 75],
    ["incomeStatement", "current", "netProfitAttributableToNci", 20, 0],
    ["incomeStatement", "current", "netProfitAttributableToParent", 0, 20],
    ["incomeStatement", "comparative", "netProfitAttributableToNci", 15, 0],
    ["incomeStatement", "comparative", "netProfitAttributableToParent", 0, 15],
  ]);
  assert.deepEqual(result.data[0]?.lines.map((line) => [line.groupAccountId, line.accountCode]), [
    [2275, "410401"],
    [2275, "410401"],
    [2275, "410401"],
    [2275, "410401"],
    [2127, "4103"],
    [2127, "4103"],
    [2127, "4103"],
    [2127, "4103"],
  ]);
});

test("uses frozen closing rates for a CAD subsidiary", () => {
  const result = buildNonControllingInterestEntries(batch({ currency: "CAD" }), groupAccounts);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const lines = result.data[0]?.lines ?? [];
  assert.deepEqual(lines.filter((line) => line.lineCode === "nonControllingInterests")
    .map((line) => [line.periodBasis, line.debit, line.credit]), [
    ["current", 500, 0],
    ["comparative", 300, 0],
  ]);
  assert.deepEqual(lines.filter((line) => line.lineCode === "netProfitAttributableToNci")
    .map((line) => [line.periodBasis, line.debit, line.credit]), [
    ["current", 100, 0],
    ["comparative", 60, 0],
  ]);
});

test("does not generate an allocation for a wholly owned subsidiary", () => {
  const result = buildNonControllingInterestEntries(batch({ shareRatio: 1 }), groupAccounts);
  assert.deepEqual(result, { ok: true, data: [] });
});

test("requires a unique frozen closing rate for foreign-currency allocation", () => {
  const input = batch({ currency: "CAD" });
  input.exchangeRates = input.exchangeRates.filter((rate) =>
    rate.applications.some((application) => application.periodBasis === "current"));
  const result = buildNonControllingInterestEntries(input, groupAccounts);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "rateApplications");
});
