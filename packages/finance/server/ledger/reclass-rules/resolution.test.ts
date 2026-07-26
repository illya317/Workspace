import assert from "node:assert/strict";
import test from "node:test";

import { resolveGroupReclassRule } from "./resolution";

const baseRule = {
  policyVersionId: 1,
  targetGroupAccountId: 2,
  sourceAccountCode: "1221",
  decision: "reclassify",
  targetAccountCode: "2241",
  enabled: true,
};

test("resolves the nearest ancestor group-account rule", () => {
  const rules = [
    { ...baseRule, id: 1, sourceGroupAccountId: 10, abnormalSide: "credit" },
    { ...baseRule, id: 2, sourceGroupAccountId: 11, abnormalSide: "credit" },
  ];
  const parents = new Map<number, number | null>([[12, 11], [11, 10], [10, null]]);

  assert.equal(resolveGroupReclassRule(12, "credit", rules, parents)?.id, 2);
});

test("does not resolve a rule from another abnormal side", () => {
  const rules = [{ ...baseRule, id: 1, sourceGroupAccountId: 10, abnormalSide: "debit" }];
  assert.equal(resolveGroupReclassRule(10, "credit", rules, new Map([[10, null]])), undefined);
});
