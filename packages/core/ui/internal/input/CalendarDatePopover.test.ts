import assert from "node:assert/strict";
import test from "node:test";
import { parseMonth, parseQuarter, parseYear } from "./CalendarDatePopover";

test("parses year, quarter, and month picker values", () => {
  assert.deepEqual(parseYear("2026"), { year: 2026, monthIndex: 0, day: 1 });
  assert.deepEqual(parseQuarter("2026-Q4"), { year: 2026, monthIndex: 9, day: 1 });
  assert.deepEqual(parseMonth("2026-12"), { year: 2026, monthIndex: 11, day: 1 });
});

test("rejects invalid picker values", () => {
  assert.equal(parseYear("26"), null);
  assert.equal(parseQuarter("2026-Q5"), null);
  assert.equal(parseMonth("2026-13"), null);
});
