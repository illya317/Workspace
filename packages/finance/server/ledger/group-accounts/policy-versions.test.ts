import assert from "node:assert/strict";
import test from "node:test";

import { isFinanceAccountingPolicyVersionEffectiveAt } from "./policy-version-rules";

test("V1 covers all history until the V2 effective boundary", () => {
  const boundary = new Date("2027-01-01T00:00:00.000Z");
  const v1 = { effectiveFrom: null, effectiveTo: boundary };
  const v2 = { effectiveFrom: boundary, effectiveTo: null };

  assert.equal(isFinanceAccountingPolicyVersionEffectiveAt(v1, "1999-01-01"), true);
  assert.equal(isFinanceAccountingPolicyVersionEffectiveAt(v1, "2026-12-31"), true);
  assert.equal(isFinanceAccountingPolicyVersionEffectiveAt(v1, "2027-01-01"), false);
  assert.equal(isFinanceAccountingPolicyVersionEffectiveAt(v2, "2026-12-31"), false);
  assert.equal(isFinanceAccountingPolicyVersionEffectiveAt(v2, "2027-01-01"), true);
});
