import assert from "node:assert/strict";
import test from "node:test";

import { buildSetConsolidationInclusionCommand } from "./consolidation-inclusion-validation";

test("builds a period-effective consolidation inclusion command", () => {
  const result = buildSetConsolidationInclusionCommand({
    relationId: 76,
    expectedVersion: 1,
    included: false,
    effectiveDate: "2026-07-31",
  }, 9);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, {
    relationId: 76,
    expectedVersion: 1,
    included: false,
    effectiveDate: "2026-07-31",
    actorUserId: 9,
  });
});

test("rejects invalid choice, date and optimistic-lock inputs", () => {
  assert.equal(buildSetConsolidationInclusionCommand({
    relationId: 0, expectedVersion: 1, included: true, effectiveDate: "2026-07-31",
  }, 9).ok, false);
  assert.equal(buildSetConsolidationInclusionCommand({
    relationId: 1, expectedVersion: 0, included: true, effectiveDate: "2026-07-31",
  }, 9).ok, false);
  assert.equal(buildSetConsolidationInclusionCommand({
    relationId: 1, expectedVersion: 1, included: "true", effectiveDate: "2026-07-31",
  }, 9).ok, false);
  assert.equal(buildSetConsolidationInclusionCommand({
    relationId: 1, expectedVersion: 1, included: true, effectiveDate: "2026-02-29",
  }, 9).ok, false);
});
