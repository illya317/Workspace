import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidatedOutputLine } from "@workspace/finance/types";
import {
  reconcileCadCashFlowTranslation,
  type CashFlowMonthlySource,
} from "./consolidated-output-cash-flow";

const SOURCE_AMOUNTS = {
  salesReceipt: 0,
  taxRefund: 0,
  otherOpIn: 0,
  operatingInSubtotal: 0,
  purchasePayment: 3.33,
  staffPayment: 3.33,
  taxPayment: 0,
  otherOpOut: 0,
  operatingOutSubtotal: 6.66,
  operatingNet: -6.66,
  investingNet: 0,
  financingNet: 0,
  fxEffect: 0,
  netIncrease: -6.66,
  openingCash: 10,
  endingCash: 3.34,
};

const TRANSLATED_AMOUNTS = {
  salesReceipt: 0,
  taxRefund: 0,
  otherOpIn: 0,
  operatingInSubtotal: 0,
  purchasePayment: 5,
  staffPayment: 5,
  taxPayment: 0,
  otherOpOut: 0,
  operatingOutSubtotal: 9.99,
  operatingNet: -9.99,
  investingNet: 0,
  financingNet: 0,
  fxEffect: 0,
  netIncrease: -9.99,
  openingCash: 15,
  endingCash: 5.01,
};

function translatedLine(lineCode: string, amount: number): ConsolidatedOutputLine {
  return {
    lineCode,
    label: lineCode,
    code: lineCode,
    amount,
    previousAmount: 0,
    section: "operating",
    side: "debit",
    direction: lineCode.includes("Net") ? "net" : "in",
    subtract: false,
    isHeader: false,
    isTotal: lineCode.endsWith("Subtotal") || lineCode.endsWith("Net"),
    isGrandTotal: ["netIncrease", "endingCash"].includes(lineCode),
    sourceAmount: amount,
    adjustmentAmount: 0,
    previousSourceAmount: 0,
    previousAdjustmentAmount: 0,
  };
}

function monthlySource(
  year: number,
  amounts: Record<string, number>,
): CashFlowMonthlySource[] {
  return Array.from({ length: 12 }, (_, index) => ({
    periodEnd: new Date(Date.UTC(year, index + 1, 0)).toISOString().slice(0, 10),
    lines: Object.entries(amounts).map(([lineCode, amount]) => ({
      lineCode,
      amount: index === 11 ? amount : 0,
    })),
  }));
}

function reconcile(currentAmounts: Record<string, number> = SOURCE_AMOUNTS) {
  return reconcileCadCashFlowTranslation({
    entityLabel: "加拿大公司",
    currentFlows: monthlySource(2026, currentAmounts),
    comparativeFlows: monthlySource(2025, Object.fromEntries(
      Object.keys(SOURCE_AMOUNTS).map((lineCode) => [lineCode, 0]),
    )),
    translatedLines: Object.entries(TRANSLATED_AMOUNTS).map(([lineCode, amount]) => (
      translatedLine(lineCode, amount)
    )),
  });
}

test("cash flow translation closes the display chain with translation rounding only", () => {
  const result = reconcile();
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  const byCode = new Map(result.data.map((line) => [line.lineCode, line]));
  assert.equal(byCode.get("operatingOutSubtotal")?.amount, 10);
  assert.equal(byCode.get("operatingNet")?.amount, -10);
  assert.equal(byCode.get("fxEffect")?.amount, 0.01);
  assert.equal(byCode.get("netIncrease")?.amount, -9.99);
  assert.equal(byCode.get("endingCash")?.amount, 5.01);
});

test("cash flow translation rejects a real source-currency cent mismatch", () => {
  const result = reconcile({ ...SOURCE_AMOUNTS, operatingOutSubtotal: 6.65 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "cashFlowSourceReconciliation");
});
