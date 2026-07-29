import assert from "node:assert/strict";
import test from "node:test";
import {
  liveOrganizationVersions,
  organizationChangeIsNoOp,
  organizationVersionAt,
  parseOrganizationLifecycleMeta,
  planOrganizationEffectiveChange,
  resolveSameDayCorrectionMeta,
  type OrganizationEffectiveVersion,
} from "./organization-effective-version";
import { positionReportOverrideBatchRequestFingerprint } from "./organization-structure-command";

type Payload = { name: string };

test("position report override batch fingerprint covers every row and lifecycle field", () => {
  const base = {
    positionId: 11,
    overrides: [{ id: 3, version: 2, companyId: 4, departmentId: 5, headcount: 1 }],
    lifecycle: {
      kind: "correct",
      effectiveOn: "2026-07-27",
      expectedSequence: 2,
      reason: "修正",
      targetVersionId: 9,
      idempotencyKey: "batch-a",
    },
  };
  const fingerprint = positionReportOverrideBatchRequestFingerprint(base);
  assert.notEqual(fingerprint, positionReportOverrideBatchRequestFingerprint({
    ...base,
    overrides: [{ ...base.overrides[0], headcount: 2 }],
  }));
  assert.notEqual(fingerprint, positionReportOverrideBatchRequestFingerprint({
    ...base,
    lifecycle: { ...base.lifecycle, expectedSequence: 3 },
  }));
  assert.equal(fingerprint, positionReportOverrideBatchRequestFingerprint({
    ...base,
    lifecycle: { ...base.lifecycle, idempotencyKey: "batch-b" },
  }));
});

function version(
  id: number,
  from: string | null,
  to: string | null,
  name: string,
  overrides: Partial<OrganizationEffectiveVersion<Payload>> = {},
): OrganizationEffectiveVersion<Payload> {
  return {
    id,
    sequence: id,
    validFrom: from,
    validToExclusive: to,
    recordState: "confirmed",
    supersedesId: null,
    payload: { name },
    ...overrides,
  };
}

test("schedule splits one live period without losing its historical slice", () => {
  const plan = planOrganizationEffectiveChange([version(1, null, null, "旧组织")], {
    kind: "schedule",
    effectiveOn: "2026-08-01",
    asOf: "2026-07-27",
    payload: { name: "新组织" },
  });
  assert.deepEqual(plan.drafts.map((row) => [row.validFrom, row.validToExclusive, row.payload.name]), [
    [null, "2026-08-01", "旧组织"],
    ["2026-08-01", null, "新组织"],
  ]);
  assert.ok(plan.drafts.every((row) => row.supersedesId === 1));
});

test("as-of query separates current, upcoming and history", () => {
  const rows = [
    version(1, null, "2026-08-01", "当前"),
    version(2, "2026-08-01", null, "未来"),
  ];
  assert.equal(organizationVersionAt(rows, "2026-07-27")?.payload.name, "当前");
  assert.equal(organizationVersionAt(rows, "2026-08-01")?.payload.name, "未来");
});

test("correction supersedes the selected immutable version and requires a reason", () => {
  const current = version(1, "2026-01-01", null, "错字");
  assert.throws(() => planOrganizationEffectiveChange([current], {
    kind: "correct",
    effectiveOn: "2026-01-01",
    asOf: "2026-07-27",
    targetVersionId: 1,
    payload: { name: "正字" },
  }), /原因/);
  const plan = planOrganizationEffectiveChange([current], {
    kind: "correct",
    effectiveOn: "2026-01-01",
    asOf: "2026-07-27",
    targetVersionId: 1,
    reason: "录入错误",
    payload: { name: "正字" },
  });
  assert.equal(plan.drafts[0]?.supersedesId, 1);
  assert.equal(plan.drafts[0]?.payload.name, "正字");
});

test("same-day second schedule must be expressed as correction", () => {
  assert.throws(() => planOrganizationEffectiveChange([version(1, "2026-08-01", null, "A")], {
    kind: "schedule",
    effectiveOn: "2026-08-01",
    asOf: "2026-07-27",
    payload: { name: "B" },
  }), /纠错命令/);
});

test("ordinary same-day save resolves to correction and exact payload is a no-op", () => {
  const rows = [version(1, "2026-08-01", null, "A")];
  const meta = resolveSameDayCorrectionMeta(rows, {
    kind: "schedule",
    effectiveOn: "2026-08-01",
    expectedSequence: 1,
    idempotencyKey: "direct-1",
    reason: null,
    targetVersionId: null,
  }, "岗位资料");
  assert.equal(meta.kind, "correct");
  assert.equal(meta.targetVersionId, 1);
  assert.equal(meta.reason, "同日直接修改岗位资料");
  assert.equal(organizationChangeIsNoOp(rows, meta, { name: "A" }), true);
  assert.equal(organizationChangeIsNoOp(rows, meta, { name: "B" }), false);
});

test("ordinary save against an older live version is an exact no-op", () => {
  const rows = [version(1, "2026-01-01", null, "A")];
  const meta = resolveSameDayCorrectionMeta(rows, {
    kind: "schedule",
    effectiveOn: "2026-07-29",
    expectedSequence: 1,
    idempotencyKey: "direct-older-1",
    reason: null,
    targetVersionId: null,
  }, "岗位资料");
  assert.equal(meta.kind, "schedule");
  assert.equal(organizationChangeIsNoOp(rows, meta, { name: "A" }), true);
  assert.equal(organizationChangeIsNoOp(rows, meta, { name: "B" }), false);
});

test("end-date keeps the slice before the exclusive boundary and appends cancellation provenance", () => {
  const plan = planOrganizationEffectiveChange([version(1, "2026-01-01", null, "岗位")], {
    kind: "end-date",
    effectiveOn: "2026-08-01",
    asOf: "2026-07-27",
    reason: "撤销岗位",
  });
  assert.deepEqual(plan.drafts.map((row) => [row.recordState, row.validFrom, row.validToExclusive]), [
    ["confirmed", "2026-01-01", "2026-08-01"],
    ["cancelled", "2026-08-01", null],
  ]);
});

test("cancel-future rejects current rows and preserves an explicit cancellation marker", () => {
  const current = version(1, "2026-01-01", "2026-08-01", "当前");
  const future = version(2, "2026-08-01", null, "未来");
  assert.throws(() => planOrganizationEffectiveChange([current, future], {
    kind: "cancel-future",
    effectiveOn: "2026-01-01",
    asOf: "2026-07-27",
    targetVersionId: 1,
  }), /尚未生效/);
  const plan = planOrganizationEffectiveChange([current, future], {
    kind: "cancel-future",
    effectiveOn: "2026-08-01",
    asOf: "2026-07-27",
    targetVersionId: 2,
    reason: "计划撤销",
  });
  assert.equal(plan.drafts[0]?.recordState, "cancelled");
  assert.equal(plan.drafts[0]?.supersedesId, 2);
});

test("a superseded row is never returned as a live version", () => {
  const rows = [
    version(1, null, null, "旧"),
    version(2, null, null, "新", { supersedesId: 1 }),
  ];
  assert.deepEqual(liveOrganizationVersions(rows).map((row) => row.id), [2]);
});

test("overlapping live versions fail closed", () => {
  assert.throws(() => organizationVersionAt([
    version(1, "2026-01-01", null, "A"),
    version(2, "2026-06-01", null, "B"),
  ], "2026-07-27"), /重叠/);
});

test("commit metadata requires idempotency and an optimistic expected sequence", () => {
  assert.throws(() => parseOrganizationLifecycleMeta({
    kind: "schedule",
    effectiveOn: "2026-08-01",
    expectedSequence: 3,
  }), /幂等键/);
  assert.throws(() => parseOrganizationLifecycleMeta({
    kind: "schedule",
    effectiveOn: "2026-08-01",
    expectedSequence: -1,
    idempotencyKey: "command-1",
  }), /expected sequence/);
  assert.equal(parseOrganizationLifecycleMeta({
    kind: "schedule",
    effectiveOn: "2026-08-01",
    expectedSequence: 3,
    idempotencyKey: "command-1",
  }).expectedSequence, 3);
});
