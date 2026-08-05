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
  lines[2]!.entityAmounts = [{
    entitySnapshotId: 1,
    companyCode: "ZX01",
    companyName: "母公司",
    role: "parent",
    amount: 60,
    currentMonthAmount: 12,
    previousAmount: 40,
  }];
  const result = recomputeConsolidatedIncome(lines);
  assert.equal(result.ok, true);
  assert.equal(lines.find((item) => item.lineCode === "netProfit")?.amount, 60);
  assert.equal(lines.find((item) => item.lineCode === "netProfitAttributableToParent")?.amount, 45);
  assert.equal(lines.find((item) => item.lineCode === "netProfitAttributableToNci")?.amount, 15);
  assert.deepEqual(
    lines.find((item) => item.lineCode === "netProfitAttributableToParent")?.entityAmounts,
    lines[2]!.entityAmounts,
  );
  assert.deepEqual(
    lines.find((item) => item.lineCode === "netProfitAttributableToNci")?.entityAmounts?.map((item) => (
      [item.amount, item.currentMonthAmount, item.previousAmount]
    )),
    [[0, 0, 0]],
  );
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

test("current-month NCI attribution is preserved from dated consolidation entries", () => {
  const revenue = line("revenue", 100);
  revenue.currentMonthAmount = 20;
  revenue.currentMonthSourceAmount = 20;
  const net = line("netProfit", 100, { side: "debit", isGrandTotal: true });
  net.currentMonthAmount = 20;
  net.currentMonthSourceAmount = 20;
  const parent = line("netProfitAttributableToParent", -25, { adjustmentAmount: -25 });
  parent.currentMonthAmount = -5;
  parent.currentMonthAdjustmentAmount = -5;
  const nci = line("netProfitAttributableToNci", 25, { adjustmentAmount: 25 });
  nci.currentMonthAmount = 5;
  nci.currentMonthAdjustmentAmount = 5;

  const result = recomputeConsolidatedIncome([revenue, net, parent, nci]);
  assert.equal(result.ok, true);
  assert.equal(net.currentMonthAmount, 20);
  assert.equal(parent.currentMonthAmount, 15);
  assert.equal(nci.currentMonthAmount, 5);
});
