import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProjectMembershipCorrectionPlan,
  buildProjectMembershipEndPlan,
  buildProjectMembershipRoleChangePlan,
  buildProjectMembershipSchedulePlan,
  projectMembershipTemporalState,
  type ProjectMembershipVersionSnapshot,
} from "./project-membership-lifecycle";

function version(overrides: Partial<ProjectMembershipVersionSnapshot> = {}): ProjectMembershipVersionSnapshot {
  return {
    id: 11,
    membershipUid: "membership-1",
    sequence: 1,
    employeeId: 7,
    projectId: 9,
    role: "执行负责",
    startDate: "2026-01-01",
    endDate: null,
    recordState: "confirmed",
    version: 3,
    ...overrides,
  };
}

test("schedule rejects overlap but permits a later rejoin", () => {
  assert.throws(() => buildProjectMembershipSchedulePlan({
    membershipUid: "new",
    employeeId: 7,
    projectId: 9,
    role: "知会",
    startDate: "2026-06-01",
    endDate: null,
  }, [version({ endDate: "2026-06-30" })]), /重叠/);
  const plan = buildProjectMembershipSchedulePlan({
    membershipUid: "new",
    employeeId: 7,
    projectId: 9,
    role: "知会",
    startDate: "2026-07-01",
    endDate: null,
  }, [version({ endDate: "2026-06-30" })]);
  assert.equal(plan.create?.changeKind, "rejoin");
});

test("role change closes the prior inclusive period and appends a version", () => {
  const source = version();
  const plan = buildProjectMembershipRoleChangePlan({
    source,
    rowsInSeries: [source],
    nextRole: "负责人",
    effectiveOn: "2026-08-01",
  });
  assert.deepEqual(plan.sourceUpdate?.data, { endDate: "2026-07-31", reason: undefined });
  assert.equal(plan.create?.startDate, "2026-08-01");
  assert.equal(plan.create?.role, "负责人");
  assert.equal(plan.create?.sequence, 2);
  assert.deepEqual(plan.sourceBefore, source);
});

test("same-day role correction supersedes instead of creating an invalid zero-day row", () => {
  const source = version({ startDate: "2026-08-01" });
  const plan = buildProjectMembershipRoleChangePlan({
    source,
    rowsInSeries: [source],
    nextRole: "负责人",
    effectiveOn: "2026-08-01",
  });
  assert.equal(plan.sourceUpdate?.data.recordState, "superseded");
  assert.equal(plan.create?.startDate, "2026-08-01");
});

test("ending uses first-inactive-day semantics and future rows are cancelled", () => {
  assert.equal(buildProjectMembershipEndPlan({
    source: version(),
    effectiveOn: "2026-08-01",
  }).sourceUpdate?.data.endDate, "2026-07-31");
  const future = buildProjectMembershipEndPlan({
    source: version({ startDate: "2026-09-01" }),
    effectiveOn: "2026-08-01",
  });
  assert.equal(future.commandKind, "cancel-future");
  assert.equal(future.sourceUpdate?.data.recordState, "cancelled");
  assert.deepEqual(future.sourceBefore, version({ startDate: "2026-09-01" }));
});

test("correction preserves the superseded row and appends corrected facts", () => {
  const source = version();
  const plan = buildProjectMembershipCorrectionPlan({
    source,
    rows: [source],
    startDate: "2026-01-15",
    endDate: null,
    role: "支持协作",
    reason: "修正录入日期",
  });
  assert.equal(plan.sourceUpdate?.data.recordState, "superseded");
  assert.equal(plan.create?.changeKind, "correction");
  assert.equal(plan.create?.role, "支持协作");
  assert.deepEqual(plan.sourceBefore, source);
});

test("record state and temporal state remain separate", () => {
  assert.equal(projectMembershipTemporalState(version(), "2026-07-27"), "current");
  assert.equal(projectMembershipTemporalState(version({ recordState: "cancelled" }), "2026-07-27"), "past");
  assert.equal(projectMembershipTemporalState(version({ startDate: "bad" }), "2026-07-27"), "invalid");
});
