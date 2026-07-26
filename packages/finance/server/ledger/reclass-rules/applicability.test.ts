import assert from "node:assert/strict";
import test from "node:test";

import { resolveGroupReclassRule } from "./resolution";

test("a group rule follows the group-account hierarchy instead of local company codes", () => {
  const rules = [{
    id: 1,
    policyVersionId: 1,
    sourceGroupAccountId: 10,
    targetGroupAccountId: 20,
    sourceAccountCode: "2221",
    abnormalSide: "debit",
    decision: "reclassify",
    targetAccountCode: "1463",
    enabled: true,
  }];
  const parents = new Map<number, number | null>([[11, 10], [10, null]]);

  assert.equal(resolveGroupReclassRule(11, "debit", rules, parents)?.id, 1);
});
