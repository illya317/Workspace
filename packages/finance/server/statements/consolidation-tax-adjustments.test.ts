import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidatedOutputLine, ConsolidationEntrySnapshot } from "@workspace/finance/types";

import { applyConsolidationTaxAdjustments } from "./consolidation-tax-adjustments";

function line(lineCode: string, side: "debit" | "credit", amount = 0): ConsolidatedOutputLine {
  return {
    lineCode, label: lineCode, code: null, amount, previousAmount: 0, section: "test", side,
    direction: null, subtract: false, isHeader: false, isTotal: false, isGrandTotal: false,
    sourceAmount: amount, adjustmentAmount: 0,
  };
}

function entry(recognition: "asset" | "liability"): ConsolidationEntrySnapshot {
  return {
    id: 1, entryNo: "E-1", entryType: "internalTrading", title: "未实现利润", description: null,
    evidence: "底稿", status: "approved", version: 1, supersedesEntryId: null, reversalOfEntryId: null,
    predecessorEntryId: null, preparedBy: 1, submittedBy: 2, submittedAt: null, approvedBy: 3,
    approvedAt: null, approvalNote: null, reversedBy: null, reversedAt: null, createdAt: "2026-01-01",
    updatedAt: "2026-01-01", lines: [], taxEffects: [{
      id: 2, entitySnapshotId: 10, effectKey: "T-1", taxEffectType: recognition === "asset" ? "deductible" : "taxable",
      differenceAmount: 100, taxRate: 0.25, derivedTaxAmount: 25, recognition, jurisdiction: "中国大陆",
      periodBasis: "current",
      recognitionLocation: "profitOrLoss", balanceSheetLineCode: recognition === "asset" ? "deferredTaxAssets" : "deferredTaxLiabilities",
      counterpartLineCode: "incomeTax", reversalPeriod: null, recoverabilityConclusion: "可转回", evidence: "税法",
      preparedBy: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    }],
  };
}

test("recognized deductible tax adjusts DTA, income tax expense and retained earnings", () => {
  const balance = [line("deferredTaxAssets", "debit"), line("undistributedProfit", "credit")];
  const balanceResult = applyConsolidationTaxAdjustments({ reportType: "balanceSheet", lines: balance, entries: [entry("asset")], entitySnapshotIds: new Set([10]) });
  assert.equal(balanceResult.ok, true);
  assert.equal(balance[0]?.amount, 25);
  assert.equal(balance[1]?.amount, 25);

  const income = [line("incomeTax", "debit", 40)];
  const incomeResult = applyConsolidationTaxAdjustments({ reportType: "incomeStatement", lines: income, entries: [entry("asset")], entitySnapshotIds: new Set([10]) });
  assert.equal(incomeResult.ok, true);
  assert.equal(income[0]?.amount, 15);
});

test("recognized taxable tax adjusts DTL and reduces retained earnings", () => {
  const balance = [line("deferredTaxLiabilities", "credit"), line("undistributedProfit", "credit", 80)];
  const result = applyConsolidationTaxAdjustments({ reportType: "balanceSheet", lines: balance, entries: [entry("liability")], entitySnapshotIds: new Set([10]) });
  assert.equal(result.ok, true);
  assert.equal(balance[0]?.amount, 25);
  assert.equal(balance[1]?.amount, 55);
});

test("comparison-period tax effects only adjust comparison columns", () => {
  const comparative = entry("asset");
  comparative.taxEffects[0]!.periodBasis = "comparative";
  const balance = [line("deferredTaxAssets", "debit"), line("undistributedProfit", "credit")];
  const result = applyConsolidationTaxAdjustments({ reportType: "balanceSheet", lines: balance, entries: [comparative], entitySnapshotIds: new Set([10]) });
  assert.equal(result.ok, true);
  assert.equal(balance[0]?.amount, 0);
  assert.equal(balance[0]?.previousAmount, 25);
  assert.equal(balance[1]?.previousAmount, 25);
});
