import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyWorkReportCollectionStatus,
  evaluateWorkReportingPeriodPolicy,
  normalizeWorkReportingSettings,
} from "./work-reporting-policy";

test("reporting policy reads the nested Work control settings", () => {
  const settings = normalizeWorkReportingSettings({
    reporting: {
      weekly: { enabled: true, submitDeadlineOffsetDays: 2, allowLateSubmission: false },
    },
  });
  const policy = evaluateWorkReportingPeriodPolicy(
    settings,
    { type: "weekly", endDate: new Date("2026-07-19T00:00:00.000Z") },
    new Date("2026-07-22T00:00:00.000Z"),
  );

  assert.equal(policy?.deadline, "2026-07-21");
  assert.equal(policy?.submissionAllowed, false);
});

test("collection status distinguishes on-time, late, and missing reports", () => {
  const policy = evaluateWorkReportingPeriodPolicy(
    normalizeWorkReportingSettings({ weekly: { submitDeadlineOffsetDays: 1 } }),
    { type: "weekly", endDate: new Date("2026-07-19T00:00:00.000Z") },
    new Date("2026-07-22T00:00:00.000Z"),
  );
  assert.ok(policy);
  assert.equal(classifyWorkReportCollectionStatus(policy, "2026-07-20T12:00:00.000Z"), "submitted_on_time");
  assert.equal(classifyWorkReportCollectionStatus(policy, "2026-07-21T00:00:00.000Z"), "submitted_late");
  assert.equal(classifyWorkReportCollectionStatus(policy, null), "overdue");
});

test("disabled reporting stays excluded even when a historical report exists", () => {
  const policy = evaluateWorkReportingPeriodPolicy(
    normalizeWorkReportingSettings({ weekly: { enabled: false } }),
    { type: "weekly", endDate: new Date("2026-07-19T00:00:00.000Z") },
    new Date("2026-07-22T00:00:00.000Z"),
  );
  assert.ok(policy);
  assert.equal(classifyWorkReportCollectionStatus(policy, "2026-07-20T12:00:00.000Z"), "not_enabled");
});

test("missing period fields preserve the supplied fallback", () => {
  assert.deepEqual(normalizeWorkReportingSettings({ weekly: {} }).weekly, {
    enabled: true,
    submitDeadlineOffsetDays: 1,
    allowLateSubmission: true,
  });
});
