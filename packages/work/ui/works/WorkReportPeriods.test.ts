import assert from "node:assert/strict";
import test from "node:test";
import { createReportPeriodRecords } from "./WorkReportPeriods";

test("report periods are derived from cycle visibility without OKR governance controls", () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const startDate = `${year}-${pad2(month + 1)}-01`;
  const endDate = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);

  const records = createReportPeriodRecords([{
    id: 1,
    name: `${year}年${pad2(month + 1)}月`,
    periodType: "monthly",
    startDate,
    endDate,
    lifecycleStatus: "active",
  }], "monthly", startDate);

  assert.equal(records.some((record) => record.periodStart === startDate), true);
});

test("monthly report history starts in 2026 and cannot reinsert a selected 2025 fallback", () => {
  const records = createReportPeriodRecords([
    cycle(1, "2025-12-01", "2025-12-31"),
    cycle(2, "2026-01-01", "2026-01-31"),
  ], "monthly", "2025-12-01");

  assert.deepEqual(records.map((record) => record.periodStart), ["2026-01-01"]);
});

test("weekly report history starts from the first Monday of 2026 H2", () => {
  const records = createReportPeriodRecords([], "weekly", "2025-12-01");

  assert.equal(records.at(-1)?.periodStart, "2026-07-06");
  assert.equal(records.every((record) => record.periodStart >= "2026-07-06"), true);
});

function cycle(id: number, startDate: string, endDate: string) {
  return {
    id,
    name: startDate.slice(0, 7),
    periodType: "monthly" as const,
    startDate,
    endDate,
    lifecycleStatus: "active" as const,
  };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
