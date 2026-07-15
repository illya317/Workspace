import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidatedOutputLine } from "@workspace/finance/types";

import { recomputeConsolidatedIncome } from "./consolidation-nci-allocation";

function line(
  lineCode: string,
  amount: number,
  input: Partial<Pick<ConsolidatedOutputLine, "side" | "subtract" | "isGrandTotal" | "adjustmentAmount">> = {},
): ConsolidatedOutputLine {
  return {
    lineCode, label: lineCode, code: null, amount, previousAmount: 0, section: "operating",
    side: input.side ?? "credit", direction: null, subtract: input.subtract ?? false,
    isHeader: false, isTotal: false, isGrandTotal: input.isGrandTotal ?? false,
    sourceAmount: amount, adjustmentAmount: input.adjustmentAmount ?? 0,
  };
}

test("NCI allocation preserves total profit and derives the parent attribution", () => {
  const lines = [
    line("revenue", 100),
    line("cost", 40, { side: "debit", subtract: true }),
    line("netProfit", 60, { side: "debit", isGrandTotal: true }),
    line("netProfitAttributableToParent", -15, { adjustmentAmount: -15 }),
    line("netProfitAttributableToNci", 15, { adjustmentAmount: 15 }),
  ];
  const result = recomputeConsolidatedIncome(lines);
  assert.equal(result.ok, true);
  assert.equal(lines.find((item) => item.lineCode === "netProfit")?.amount, 60);
  assert.equal(lines.find((item) => item.lineCode === "netProfitAttributableToParent")?.amount, 45);
  assert.equal(lines.find((item) => item.lineCode === "netProfitAttributableToNci")?.amount, 15);
});

test("unbalanced parent and NCI attribution adjustments are rejected", () => {
  const lines = [
    line("netProfit", 60, { side: "debit", isGrandTotal: true }),
    line("netProfitAttributableToParent", -10, { adjustmentAmount: -10 }),
    line("netProfitAttributableToNci", 15, { adjustmentAmount: 15 }),
  ];
  const result = recomputeConsolidatedIncome(lines);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "nonControllingInterest");
});

test("comparison-period NCI allocation derives the prior parent attribution", () => {
  const revenue = line("revenue", 60);
  revenue.previousAmount = 40;
  revenue.previousSourceAmount = 40;
  const net = line("netProfit", 60, { side: "debit", isGrandTotal: true });
  net.previousAmount = 40;
  net.previousSourceAmount = 40;
  const parent = line("netProfitAttributableToParent", 0);
  parent.previousAdjustmentAmount = -10;
  const nci = line("netProfitAttributableToNci", 0);
  nci.previousAdjustmentAmount = 10;
  const result = recomputeConsolidatedIncome([revenue, net, parent, nci]);
  assert.equal(result.ok, true);
  assert.equal(parent.previousAmount, 30);
  assert.equal(nci.previousAmount, 10);
});
