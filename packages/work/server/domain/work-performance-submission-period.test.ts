import assert from "node:assert/strict";
import test from "node:test";
import { workPerformanceSubmissionPeriodIssue } from "./work-performance-submission-period";

test("future performance periods allow plan preparation but reject final submission", () => {
  const input = { periodStart: "2027-01-01", businessDate: "2026-07-23" };

  assert.equal(workPerformanceSubmissionPeriodIssue({ ...input, reportStage: "kr" }), null);
  assert.deepEqual(workPerformanceSubmissionPeriodIssue({ ...input, reportStage: "final" }), {
    message: "未来周期仅可保存计划，暂不能提交绩效",
    status: 409,
  });
});

test("current performance periods keep the existing submission flow", () => {
  assert.equal(workPerformanceSubmissionPeriodIssue({
    reportStage: "final",
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    businessDate: "2026-07-23",
  }), null);
});
