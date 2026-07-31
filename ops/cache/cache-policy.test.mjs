import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPrivateCachePolicyOverrides,
  loadCachePolicy,
  retentionMilliseconds,
} from "./cache-policy.mjs";

test("versioned cache policy declares every governed cache class", () => {
  const policy = loadCachePolicy({ env: {} });
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.classes["validation-receipt"].scope, "task-input");
  assert.equal(policy.classes["deployed-artifact"].pin, "production-and-rollback");
  assert.equal(retentionMilliseconds(policy.classes["compiler-cache"]), 7 * 24 * 60 * 60 * 1000);
});

test("private cache settings may tighten but never loosen governed limits", () => {
  const policy = loadCachePolicy({ env: {} });
  const tightened = applyPrivateCachePolicyOverrides(policy, {
    CACHE_POLICY_TOTAL_MAX_BYTES: String(policy.totalMaxBytes - 1),
    CACHE_POLICY_VALIDATION_RECEIPT_RETENTION_DAYS: "14",
    CACHE_POLICY_DISK_HIGH_WATERMARK_PERCENT: "70",
  });
  assert.equal(tightened.totalMaxBytes, policy.totalMaxBytes - 1);
  assert.equal(tightened.classes["validation-receipt"].retentionDays, 14);
  assert.equal(tightened.diskHighWatermarkPercent, 70);
  assert.throws(
    () => applyPrivateCachePolicyOverrides(policy, { CACHE_POLICY_TOTAL_MAX_BYTES: String(policy.totalMaxBytes + 1) }),
    /may only tighten/,
  );
  assert.throws(
    () => applyPrivateCachePolicyOverrides(policy, { CACHE_POLICY_COMPILER_CACHE_RETENTION_DAYS: "8" }),
    /may only tighten/,
  );
});
