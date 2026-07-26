import assert from "node:assert/strict";
import test from "node:test";
import { parseMonth, parseQuarter, parseWeek, parseYear } from "./CalendarDatePopover";

test("parses year, quarter, month, and ISO week picker values", () => {
  assert.deepEqual(parseYear("2026"), { year: 2026, monthIndex: 0, day: 1 });
  assert.deepEqual(parseQuarter("2026-Q4"), { year: 2026, monthIndex: 9, day: 1 });
  assert.deepEqual(parseMonth("2026-12"), { year: 2026, monthIndex: 11, day: 1 });
  assert.deepEqual(parseWeek("2026-W01"), { year: 2025, monthIndex: 11, day: 29 });
  assert.deepEqual(parseWeek("2020-W53"), { year: 2020, monthIndex: 11, day: 28 });
});

test("rejects invalid picker values", () => {
  assert.equal(parseYear("26"), null);
  assert.equal(parseQuarter("2026-Q5"), null);
  assert.equal(parseMonth("2026-13"), null);
  assert.equal(parseWeek("2021-W53"), null);
});
