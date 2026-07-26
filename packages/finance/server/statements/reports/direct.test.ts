import assert from "node:assert/strict";
import test from "node:test";

import type { IncomeStatementLineRow } from "../config/load-config-reports";
import { buildIncomeLines } from "./direct";

test("profit totals subtract positive expense amounts exactly once", () => {
  const config = [
    incomeLine("revenue", "营业收入", false),
    incomeLine("expense", "营业成本", true),
    incomeLine("profit", "营业利润", false, true),
  ];

  const lines = buildIncomeLines(
    config,
    new Map([["revenue", 100], ["expense", 140]]),
    new Map([["revenue", 80], ["expense", 90]]),
    new Map([["revenue", 20], ["expense", 35]]),
  );

  assert.equal(lines[1]?.amount, 140);
  assert.equal(lines[2]?.amount, -40);
  assert.equal(lines[2]?.currentMonthAmount, -15);
  assert.equal(lines[2]?.previousAmount, -10);
});

function incomeLine(
  lineCode: string,
  label: string,
  subtract: boolean,
  isTotal = false,
): IncomeStatementLineRow {
  return {
    lineCode,
    label,
    section: "operating",
    side: subtract ? "debit" : "credit",
    isHeader: false,
    isTotal,
    isGrandTotal: false,
    prefixes: isTotal ? [] : [lineCode],
    direction: subtract ? "debit" : "credit",
    subtract,
  };
}
