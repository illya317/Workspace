import assert from "node:assert/strict";
import test from "node:test";
import {
  consolidationPeriodLabel,
  consolidationPeriodValue,
  parseConsolidationPeriod,
  shiftConsolidationPeriod,
} from "./consolidation-period";

test("maps Finance reporting periods to their canonical year and month", () => {
  assert.equal(consolidationPeriodValue(2026, 5, "year"), "2026");
  assert.equal(consolidationPeriodValue(2026, 5, "quarter"), "2026-Q2");
  assert.equal(consolidationPeriodValue(2026, 5, "month"), "2026-05");
  assert.equal(consolidationPeriodLabel(2026, 5, "quarter"), "2026年第2季度");
  assert.deepEqual(parseConsolidationPeriod("2026-Q2", "quarter"), { year: 2026, month: 6 });
});

test("moves Finance reporting periods across year boundaries", () => {
  assert.deepEqual(shiftConsolidationPeriod(2026, 12, "month", 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftConsolidationPeriod(2026, 12, "quarter", -1), { year: 2026, month: 9 });
  assert.deepEqual(shiftConsolidationPeriod(2026, 12, "year", -1), { year: 2025, month: 12 });
});
