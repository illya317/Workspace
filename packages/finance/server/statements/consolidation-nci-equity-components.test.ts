import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";

import { nonCapitalNciAllocationLines } from "./consolidation-nci-equity-components";

function line(lineCode: string, amount: number, previousAmount: number, side: "debit" | "credit", input: {
  isTotal?: boolean;
  isGrandTotal?: boolean;
} = {}) {
  return {
    lineCode, label: lineCode, code: lineCode, amount, previousAmount,
    section: side === "debit" ? "assets" : "equity", side,
    direction: null, subtract: false, isHeader: false,
    isTotal: input.isTotal ?? false, isGrandTotal: input.isGrandTotal ?? false,
  };
}

test("first consolidation year recognizes opening NCI by equity component instead of a closing-balance plug", () => {
  const parent = { id: 1, companyId: 11, companyCode: "P01", companyName: "母公司", role: "parent", functionalCurrency: "CNY" };
  const entity = { id: 2, companyId: 22, companyCode: "S01", companyName: "子公司", role: "subsidiary", functionalCurrency: "CNY" };
  const batch = {
    id: 1, parentCompanyId: 11, parentCompanyCode: "P01", parentCompanyName: "母公司",
    year: 2026, month: 12, periodKind: "month", version: 1, revision: 1, status: "draft",
    baseBatchId: null, scopeFingerprint: "", sourceFingerprint: "", rateFingerprint: "", createdBy: 1,
    entities: [parent, entity], exchangeRates: [], entries: [], controlDecisions: [], events: [],
    sources: [{
      entitySnapshotId: 2,
      reportType: "balanceSheet",
      reportPayload: { payload: {
        assets: [line("cash", 100, 90, "debit"), line("totalAssets", 100, 90, "debit", { isGrandTotal: true })],
        liabilities: [line("payables", 40, 40, "credit"), line("totalLiabilities", 40, 40, "credit", { isGrandTotal: true })],
        equity: [
          line("paidInCapital", 62, 74, "credit"),
          line("otherComprehensiveIncome", 8, -4, "credit"),
          line("undistributedProfit", -10, -20, "credit"),
          line("totalEquity", 60, 50, "credit", { isTotal: true }),
        ],
      } },
    }],
  } as unknown as ConsolidationBatchSnapshot;
  const lines = nonCapitalNciAllocationLines({
    batch, entity: batch.entities[1]!, investor: batch.entities[0]!, minorityRatio: 0.25,
    generationKey: "policy:investment:11:22", lineNo: 1,
  });
  assert.deepEqual(lines.filter((item) => item.lineCode === "nonControllingInterests")
    .map((item) => [item.sourceId, item.debit, item.credit]), [
      ["policy:investment:11:22:nci:opening:otherComprehensiveIncome", 1, 0],
      ["policy:investment:11:22:nci:opening:undistributedProfit", 5, 0],
    ]);
  assert.deepEqual(lines.filter((item) => item.sourceId.includes(":component:opening:"))
    .map((item) => [item.lineCode, item.debit, item.credit]), [
      ["otherComprehensiveIncome", 0, 4],
      ["otherComprehensiveIncome", 3, 0],
      ["undistributedProfit", 0, 20],
      ["undistributedProfit", 15, 0],
    ]);
});

test("opening NCI source fingerprints ignore mutable batch audit state", () => {
  const parent = { id: 1, companyId: 11, companyCode: "P01", companyName: "母公司", role: "parent", functionalCurrency: "CNY" };
  const entity = { id: 2, companyId: 22, companyCode: "S01", companyName: "子公司", role: "subsidiary", functionalCurrency: "CNY" };
  const base = {
    id: 1, parentCompanyId: 11, parentCompanyCode: "P01", parentCompanyName: "母公司",
    year: 2026, month: 12, periodKind: "month", version: 1, revision: 1, status: "draft",
    baseBatchId: null, scopeFingerprint: "", sourceFingerprint: "", rateFingerprint: "", createdBy: 1,
    entities: [parent, entity], exchangeRates: [], controlDecisions: [],
    sources: [{
      entitySnapshotId: 2,
      reportType: "balanceSheet",
      reportPayload: { payload: {
        assets: [line("totalAssets", 100, 90, "debit", { isGrandTotal: true })],
        liabilities: [line("totalLiabilities", 40, 40, "credit", { isGrandTotal: true })],
        equity: [
          line("otherComprehensiveIncome", 8, -4, "credit"),
          line("totalEquity", 60, 50, "credit", { isTotal: true }),
        ],
      } },
    }],
  };
  const build = (batch: ConsolidationBatchSnapshot) => nonCapitalNciAllocationLines({
    batch, entity: batch.entities[1]!, investor: batch.entities[0]!, minorityRatio: 0.25,
    generationKey: "policy:investment:11:22", lineNo: 1,
  }).map((item) => item.sourceFingerprint);
  const before = build({ ...base, entries: [], events: [] } as unknown as ConsolidationBatchSnapshot);
  const after = build({
    ...base,
    revision: 2,
    entries: [{ id: 99 }],
    events: [{ id: 100 }],
  } as unknown as ConsolidationBatchSnapshot);
  assert.deepEqual(after, before);
});
