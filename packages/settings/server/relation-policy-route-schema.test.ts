import assert from "node:assert/strict";
import test from "node:test";

import { relationPolicyPatchSchema } from "./relation-policy-route-schema";

test("accepts an unregistered retired policy key at the 200 character limit", () => {
  const retiredPolicyKey = `r${"x".repeat(199)}`;
  const parsed = relationPolicyPatchSchema.safeParse({
    relationKey: retiredPolicyKey,
    policyKey: retiredPolicyKey,
    baselineHash: "a".repeat(64),
    expectedVersion: 9,
    reset: true,
    reason: "清理无登记的退役配置",
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.relationKey, retiredPolicyKey);
  assert.equal(parsed.data.policyKey, retiredPolicyKey);
  assert.equal(parsed.data.relationKey.length, 200);
});
