import assert from "node:assert/strict";
import test from "node:test";
import { summarizeHrPerformanceReportCollection, type HrPerformanceReportCollectionEntry } from "./performance-report-collection";

test("report collection summary uses mutually exclusive submission states", () => {
  const entry = (status: HrPerformanceReportCollectionEntry["status"]): HrPerformanceReportCollectionEntry => ({
    status,
    deadline: "2026-07-20",
    submittedAt: null,
  });
  const summary = summarizeHrPerformanceReportCollection([
    entry("submitted_on_time"),
    entry("submitted_late"),
    entry("pending"),
    entry("overdue"),
    entry("closed"),
    entry("not_enabled"),
    entry("not_available"),
  ]);

  assert.deepEqual(summary, {
    applicable: true,
    total: 5,
    submittedOnTime: 1,
    submittedLate: 1,
    overdueMissing: 2,
  });
});
