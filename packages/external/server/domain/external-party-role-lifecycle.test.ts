import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExternalPartyRoleAvailabilityPlan,
  buildExternalPartyRoleAvailabilityTimeline,
  ExternalPartyRoleLifecycleError,
  resolveExternalPartyRoleAvailability,
  type ExternalPartyRolePeriodSnapshot,
} from "./external-party-role-lifecycle";

function row(overrides: Partial<ExternalPartyRolePeriodSnapshot> = {}): ExternalPartyRolePeriodSnapshot {
  return {
    id: 1,
    roleId: 9,
    sequence: 1,
    validFrom: "2026-01-01",
    validThrough: null,
    recordState: "confirmed",
    commandKind: "establish",
    supersedesId: null,
    reason: null,
    ...overrides,
  };
}

test("as-of projection separates current and upcoming availability", () => {
  const rows = [
    row({ validThrough: "2026-06-30" }),
    row({ id: 2, sequence: 2, validFrom: "2026-08-01" }),
  ];
  assert.equal(resolveExternalPartyRoleAvailability(rows, "2026-05-01")?.id, 1);
  assert.equal(resolveExternalPartyRoleAvailability(rows, "2026-07-15"), null);
  assert.equal(resolveExternalPartyRoleAvailability(rows, "2026-08-01")?.id, 2);
  assert.equal(buildExternalPartyRoleAvailabilityTimeline(rows, "2026-07-15")[0]?.temporalState, "upcoming");
});

test("end-date appends a replacement and keeps the original period", () => {
  const source = row();
  const plan = buildExternalPartyRoleAvailabilityPlan({
    roleId: 9,
    asOfDate: "2026-07-27",
    rows: [source],
    command: { kind: "end-date", effectiveOn: "2026-08-01", reason: "停止合作" },
  });
  assert.deepEqual(plan, {
    roleId: 9,
    sequence: 2,
    validFrom: "2026-01-01",
    validThrough: "2026-07-31",
    recordState: "confirmed",
    commandKind: "end-date",
    supersedesId: 1,
    reason: "停止合作",
  });
  const timeline = buildExternalPartyRoleAvailabilityTimeline([
    source,
    { ...plan, id: 2, recordedAt: "2026-07-27T00:00:00.000Z" },
  ], "2026-07-27");
  assert.equal(timeline.find((item) => item.id === 1)?.displayRecordState, "superseded");
  assert.equal(resolveExternalPartyRoleAvailability(timeline, "2026-08-01"), null);
});

test("future cancellation is append-only and cannot cancel current availability", () => {
  const future = row({ validFrom: "2026-09-01" });
  const plan = buildExternalPartyRoleAvailabilityPlan({
    roleId: 9,
    asOfDate: "2026-07-27",
    rows: [future],
    command: { kind: "cancel-future", periodId: 1, reason: "计划撤回" },
  });
  assert.equal(plan.recordState, "cancelled");
  assert.equal(plan.supersedesId, 1);
  assert.throws(() => buildExternalPartyRoleAvailabilityPlan({
    roleId: 9,
    asOfDate: "2026-09-02",
    rows: [future],
    command: { kind: "cancel-future", periodId: 1, reason: "错误撤回" },
  }), ExternalPartyRoleLifecycleError);
});

test("schedule and correction reject overlap but allow adjacent periods", () => {
  const existing = row({ validThrough: "2026-07-31" });
  assert.equal(buildExternalPartyRoleAvailabilityPlan({
    roleId: 9,
    asOfDate: "2026-07-27",
    rows: [existing],
    command: { kind: "schedule", validFrom: "2026-08-01", validThrough: null },
  }).sequence, 2);
  assert.throws(() => buildExternalPartyRoleAvailabilityPlan({
    roleId: 9,
    asOfDate: "2026-07-27",
    rows: [existing],
    command: { kind: "schedule", validFrom: "2026-07-31", validThrough: null },
  }), /重叠/);
});

test("same source period cannot be corrected twice from a stale view", () => {
  const source = row();
  const correction = row({ id: 2, sequence: 2, commandKind: "correct", supersedesId: 1, reason: "边界纠正" });
  assert.throws(() => buildExternalPartyRoleAvailabilityPlan({
    roleId: 9,
    asOfDate: "2026-07-27",
    rows: [source, correction],
    command: {
      kind: "correct",
      periodId: 1,
      validFrom: "2026-02-01",
      validThrough: null,
      reason: "并发纠正",
    },
  }), /已被替代/);
});
