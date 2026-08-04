import assert from "node:assert/strict";
import test from "node:test";
import type { ConsolidatedOutputLine } from "@workspace/finance/types";
import { recomputeTranslatedIncome } from "./consolidated-output-income-translation";

function line(
  lineCode: string,
  amount: number,
  input: Partial<Pick<ConsolidatedOutputLine, "subtract" | "isTotal" | "isGrandTotal">> = {},
): ConsolidatedOutputLine {
  return {
    lineCode,
    label: lineCode,
    code: lineCode,
    amount,
    currentMonthAmount: amount,
    previousAmount: 0,
    section: "operating",
    side: "debit",
    direction: "net",
    isHeader: false,
    subtract: false,
    isTotal: false,
    isGrandTotal: false,
    sourceAmount: amount,
    adjustmentAmount: 0,
    ...input,
  };
}

test("CAD derives profit totals after translating and rounding each detail line", () => {
  const lines = [
    line("cost", 5, { subtract: true }),
    line("admin", 5, { subtract: true }),
    line("operatingProfit", -9.99, { isTotal: true }),
    line("totalProfit", -9.99, { isTotal: true }),
    line("netProfit", -9.99, { isGrandTotal: true }),
  ];
  recomputeTranslatedIncome(lines);
  for (const lineCode of ["operatingProfit", "totalProfit", "netProfit"]) {
    const translated = lines.find((item) => item.lineCode === lineCode)!;
    assert.equal(translated.amount, -10);
    assert.equal(translated.currentMonthAmount, -10);
  }
});
