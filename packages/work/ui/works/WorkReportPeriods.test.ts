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

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
