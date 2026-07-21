import assert from "node:assert/strict";
import test from "node:test";
import { periodFromValue, periodLabel, periodValue } from "./model";

test("formats selectable Work Gantt periods for every zoom", () => {
  const date = new Date(2026, 10, 18);
  assert.equal(periodValue(date, "year"), "2026");
  assert.equal(periodValue(date, "quarter"), "2026-Q4");
  assert.equal(periodValue(date, "month"), "2026-11");
  assert.equal(periodLabel(date, "year"), "2026年");
  assert.equal(periodLabel(date, "quarter"), "2026年第4季度");
  assert.equal(periodLabel(date, "month"), "2026年11月");
});

test("parses direct Work Gantt period selections", () => {
  assert.deepEqual(periodParts(periodFromValue("2024", "year")), [2024, 1]);
  assert.deepEqual(periodParts(periodFromValue("2025-Q3", "quarter")), [2025, 7]);
  assert.deepEqual(periodParts(periodFromValue("2026-02", "month")), [2026, 2]);
  assert.equal(periodFromValue("2026-Q5", "quarter"), null);
  assert.equal(periodFromValue("2026-13", "month"), null);
});

function periodParts(value: Date | null) {
  return value ? [value.getFullYear(), value.getMonth() + 1] : null;
}
