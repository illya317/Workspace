import assert from "node:assert/strict";
import test from "node:test";

import { buildReviewFinanceGroupAccountCommand } from "../../domain/group-chart-validation";

import { resolveGroupAccountReviewTransition } from "./review";

test("pending_review approve becomes reviewed with review audit", () => {
  const result = resolveGroupAccountReviewTransition("pending_review", "approve");
  assert.deepEqual(result, {
    ok: true,
    transition: { kind: "setStatus", nextStatus: "reviewed", recordReview: true },
  });
});

test("pending_review reject becomes pending_delete without review audit", () => {
  const result = resolveGroupAccountReviewTransition("pending_review", "reject");
  assert.deepEqual(result, {
    ok: true,
    transition: { kind: "setStatus", nextStatus: "pending_delete", recordReview: false },
  });
});

test("pending_delete approve routes to the guarded hard delete", () => {
  const result = resolveGroupAccountReviewTransition("pending_delete", "approve");
  assert.deepEqual(result, { ok: true, transition: { kind: "delete" } });
});

test("pending_delete reject restores the account to reviewed with review audit", () => {
  const result = resolveGroupAccountReviewTransition("pending_delete", "reject");
  assert.deepEqual(result, {
    ok: true,
    transition: { kind: "setStatus", nextStatus: "reviewed", recordReview: true },
  });
});

test("confirmed and reviewed are terminal states for review actions", () => {
  for (const status of ["confirmed", "reviewed"]) {
    for (const decision of ["approve", "reject"] as const) {
      const result = resolveGroupAccountReviewTransition(status, decision);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.status, 409);
    }
  }
});

test("unknown review status is rejected as a conflict", () => {
  const result = resolveGroupAccountReviewTransition("archived", "approve");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
});

test("review command requires a valid decision and optimistic-lock timestamp", () => {
  const valid = buildReviewFinanceGroupAccountCommand({
    userId: 1,
    groupAccountId: 8,
    decision: "approve",
    expectedUpdatedAt: "2026-07-24T00:00:00.000Z",
  });
  assert.equal(valid.ok, true);

  assert.equal(buildReviewFinanceGroupAccountCommand({
    userId: 1,
    groupAccountId: 8,
    decision: "approve",
    expectedUpdatedAt: "not-a-date",
  }).ok, false);

  assert.equal(buildReviewFinanceGroupAccountCommand({
    userId: 1,
    groupAccountId: 0,
    decision: "reject",
    expectedUpdatedAt: "2026-07-24T00:00:00.000Z",
  }).ok, false);

  assert.equal(buildReviewFinanceGroupAccountCommand({
    userId: 1,
    groupAccountId: 8,
    // @ts-expect-error 运行时仍须拒绝非法复核决定
    decision: "maybe",
    expectedUpdatedAt: "2026-07-24T00:00:00.000Z",
  }).ok, false);
});
