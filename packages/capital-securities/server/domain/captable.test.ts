import assert from "node:assert/strict";
import test from "node:test";

import { calculateCaptableMetrics, isOwnershipActiveAt } from "./captable";

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

test("captable includes confirmed ownership on inclusive effective boundaries", () => {
  const interest = {
    recordStatus: "confirmed" as const,
    effectiveFrom: date("2024-01-01"),
    effectiveTo: date("2024-12-31"),
  };
  assert.equal(isOwnershipActiveAt(interest, date("2024-01-01")), true);
  assert.equal(isOwnershipActiveAt(interest, date("2024-12-31")), true);
  assert.equal(isOwnershipActiveAt(interest, date("2025-01-01")), false);
});

test("captable excludes pending changes even when their dates overlap", () => {
  assert.equal(isOwnershipActiveAt({
    recordStatus: "pending",
    effectiveFrom: date("2024-01-01"),
    effectiveTo: null,
  }, date("2024-07-01")), false);
});

test("captable totals determine whether the ownership snapshot is complete", () => {
  assert.deepEqual(calculateCaptableMetrics([{ shareRatio: 0.4 }, { shareRatio: 0.6 }]), {
    shareholderCount: 2,
    totalShareRatio: 1,
    differenceFromFullOwnership: 0,
    isComplete: true,
  });
  assert.equal(calculateCaptableMetrics([{ shareRatio: 0.9 }, { shareRatio: null }]).isComplete, false);
});
