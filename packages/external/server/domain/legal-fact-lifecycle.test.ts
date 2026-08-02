import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLegalFactTimeline,
  LegalFactLifecycleError,
  planLegalFactCommand,
  resolveLegalFactAsOf,
  type LegalFactRevisionLike,
  type LegalFactSnapshot,
} from "./legal-fact-lifecycle";

const baseline: LegalFactSnapshot = {
  subjectType: "organization",
  name: "示例公司",
  fullName: "示例公司有限公司",
  identityNumber: "9132X",
  legalRepresentative: "张三",
  registeredCapital: "100万元",
  registeredAddress: "南京市",
  registeredDate: "2020-01-01",
};

test("resolves current and scheduled legal facts by business date", () => {
  const rows = [row(1, 1, "2026-01-01", baseline), row(2, 2, "2026-08-01", { ...baseline, name: "新名称" })];
  assert.equal(resolveLegalFactAsOf(rows, "2026-07-31")?.name, "示例公司");
  assert.equal(resolveLegalFactAsOf(rows, "2026-08-01")?.name, "新名称");
  const timeline = buildLegalFactTimeline(rows, "2026-07-31");
  assert.equal(timeline.find((item) => item.id === 1)?.validThrough, "2026-07-31");
  assert.equal(timeline.find((item) => item.id === 2)?.temporalState, "upcoming");
});

test("correction supersedes a recorded version without overwriting it", () => {
  const original = row(1, 1, "2026-01-01", baseline);
  const plan = planLegalFactCommand({
    timeline: [original],
    command: { kind: "correction", supersedesId: 1, snapshot: { ...baseline, legalRepresentative: "李四" }, reason: "录入错误" },
    asOf: "2026-07-27",
    expectedRevision: 1,
    idempotencyKey: "correction-1",
  });
  assert.equal(plan.kind, "append");
  if (plan.kind !== "append") return;
  const correction = row(2, plan.revision, plan.effectiveOn, plan.snapshot, {
    commandKind: plan.commandKind,
    supersedesId: plan.supersedesId,
    reason: plan.reason,
  });
  assert.equal(resolveLegalFactAsOf([original, correction], "2026-07-27")?.legalRepresentative, "李四");
  assert.equal(buildLegalFactTimeline([original, correction], "2026-07-27").find((item) => item.id === 1)?.displayRecordState, "superseded");
});

test("cancels only future versions by appending a cancellation", () => {
  const future = row(2, 2, "2026-09-01", { ...baseline, name: "未来名称" });
  const plan = planLegalFactCommand({
    timeline: [row(1, 1, "2026-01-01", baseline), future],
    command: { kind: "cancel-future", supersedesId: 2, reason: "工商计划撤回" },
    asOf: "2026-07-27",
    expectedRevision: 2,
    idempotencyKey: "cancel-2",
  });
  assert.equal(plan.kind, "append");
  if (plan.kind === "append") assert.equal(plan.recordState, "cancelled");
  assert.throws(() => planLegalFactCommand({
    timeline: [row(1, 1, "2026-01-01", baseline)],
    command: { kind: "cancel-future", supersedesId: 1, reason: "错误" },
    asOf: "2026-07-27",
    expectedRevision: 1,
    idempotencyKey: "cancel-current",
  }), LegalFactLifecycleError);
});

test("requires optimistic revision and makes retries idempotent", () => {
  const existing = row(1, 1, "2026-01-01", baseline, { idempotencyKey: "same-key" });
  assert.equal(planLegalFactCommand({
    timeline: [existing],
    command: { kind: "change", effectiveOn: "2026-08-01", snapshot: baseline },
    asOf: "2026-07-27",
    expectedRevision: 999,
    idempotencyKey: "same-key",
  }).kind, "idempotent");
  assert.throws(() => planLegalFactCommand({
    timeline: [existing],
    command: { kind: "change", effectiveOn: "2026-08-01", snapshot: baseline },
    asOf: "2026-07-27",
    expectedRevision: 0,
    idempotencyKey: "new-key",
  }), LegalFactLifecycleError);
});

test("same-day sequences resolve to the highest revision without an invalid zero-day period", () => {
  const rows = [
    row(1, 1, "2026-07-27", baseline),
    row(2, 2, "2026-07-27", { ...baseline, name: "当日最终名称" }),
  ];
  assert.equal(resolveLegalFactAsOf(rows, "2026-07-27")?.id, 2);
  const timeline = buildLegalFactTimeline(rows, "2026-07-27");
  assert.equal(timeline.find((item) => item.id === 1)?.displayRecordState, "superseded");
  assert.notEqual(timeline.find((item) => item.id === 2)?.temporalState, "invalid");
});

function row(
  id: number,
  revision: number,
  effectiveOn: string,
  snapshot: LegalFactSnapshot,
  overrides: Partial<LegalFactRevisionLike> = {},
): LegalFactRevisionLike {
  return {
    ...snapshot,
    id,
    revision,
    commandKind: "change",
    effectiveOn,
    recordState: "confirmed",
    supersedesId: null,
    idempotencyKey: `key-${id}`,
    reason: null,
    recordedAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}
