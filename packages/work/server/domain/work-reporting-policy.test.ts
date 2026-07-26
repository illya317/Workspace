import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorkOkrControlSettings } from "../work-okr-control-config";
import { evaluateWorkReportingPolicy, workReportingPolicyError } from "./work-reporting-policy";

test("weekly reporting defaults stay available after the deadline", () => {
  const settings = normalizeWorkOkrControlSettings({});
  const policy = evaluateWorkReportingPolicy(
    settings,
    { type: "weekly", endDate: new Date("2026-07-19T00:00:00.000Z") },
    new Date("2026-07-22T00:00:00.000Z"),
  );

  assert.deepEqual(policy, {
    periodType: "weekly",
    enabled: true,
    deadline: "2026-07-20",
    isLate: true,
    allowLateSubmission: true,
    submissionAllowed: true,
  });
});

test("monthly reporting can reject late submissions", () => {
  const settings = normalizeWorkOkrControlSettings({
    reporting: {
      monthly: { enabled: true, submitDeadlineOffsetDays: 2, allowLateSubmission: false },
    },
  });
  const policy = evaluateWorkReportingPolicy(
    settings,
    { type: "monthly", endDate: new Date("2026-06-30T00:00:00.000Z") },
    new Date("2026-07-04T00:00:00.000Z"),
  );

  assert.equal(policy?.submissionAllowed, false);
  assert.equal(policy && workReportingPolicyError(policy), "本期月报已于 2026-07-02 截止");
});

test("target assessment periods are outside reporting policy", () => {
  const settings = normalizeWorkOkrControlSettings({});
  assert.equal(evaluateWorkReportingPolicy(
    settings,
    { type: "quarterly", endDate: new Date("2026-06-30T00:00:00.000Z") },
  ), null);
});
