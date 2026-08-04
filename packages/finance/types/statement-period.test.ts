import assert from "node:assert/strict";
import test from "node:test";

import {
  BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL,
  BALANCE_SHEET_CURRENT_AMOUNT_LABEL,
  FLOW_STATEMENT_COMPARATIVE_AMOUNT_LABEL,
  FLOW_STATEMENT_CURRENT_AMOUNT_LABEL,
  FLOW_STATEMENT_CURRENT_MONTH_AMOUNT_LABEL,
  balanceSheetOpeningPoint,
  balanceSheetOpeningReclassPoint,
  formatStatementPeriodEndLabel,
  statementPeriodStartMonth,
} from "./statement-period";

test("uses the statutory general-enterprise amount headers", () => {
  assert.equal(BALANCE_SHEET_CURRENT_AMOUNT_LABEL, "期末余额");
  assert.equal(BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL, "上年年末余额");
  assert.equal(FLOW_STATEMENT_CURRENT_MONTH_AMOUNT_LABEL, "当月金额");
  assert.equal(FLOW_STATEMENT_CURRENT_AMOUNT_LABEL, "本年累计金额");
  assert.equal(FLOW_STATEMENT_COMPARATIVE_AMOUNT_LABEL, "上年同期累计金额");
});

test("uses the persisted accounting period end date", () => {
  assert.equal(formatStatementPeriodEndLabel({
    year: 2026,
    month: 6,
    endDate: "2026-06-30",
  }), "2026年6月30日");
});

test("falls back to the real calendar month end", () => {
  assert.equal(formatStatementPeriodEndLabel({ year: 2024, month: 2 }), "2024年2月29日");
  assert.equal(formatStatementPeriodEndLabel({ year: 2025, month: 2 }), "2025年2月28日");
  assert.equal(formatStatementPeriodEndLabel({ year: 2026, month: 4 }), "2026年4月30日");
});

test("uses prior year-end as the balance sheet comparative basis for every report period", () => {
  assert.equal(BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL, "上年年末余额");
  assert.deepEqual(balanceSheetOpeningPoint({ year: 2026, month: 12 }), { year: 2026, month: 1 });
  assert.deepEqual(balanceSheetOpeningPoint({ year: 2026, month: 6 }), { year: 2026, month: 1 });
  assert.deepEqual(balanceSheetOpeningPoint({ year: 2026, month: 7 }), { year: 2026, month: 1 });
  assert.deepEqual(balanceSheetOpeningReclassPoint({ year: 2026, month: 12 }), { year: 2025, month: 12 });
  assert.deepEqual(balanceSheetOpeningReclassPoint({ year: 2026, month: 6 }), { year: 2025, month: 12 });
  assert.deepEqual(balanceSheetOpeningReclassPoint({ year: 2026, month: 7 }), { year: 2025, month: 12 });
});

test("derives the first month covered by each statement period kind", () => {
  assert.equal(statementPeriodStartMonth(12, "year"), 1);
  assert.equal(statementPeriodStartMonth(9, "quarter"), 7);
  assert.equal(statementPeriodStartMonth(5, "month"), 5);
});
