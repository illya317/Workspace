import assert from "node:assert/strict";
import test from "node:test";

import { buildGroupAccountUsageById, matchesFinanceGroupAccountUsage } from "./account-usage";

test("classifies consolidation accounts from the group-account consolidation role", () => {
  const usage = buildGroupAccountUsageById([
    { groupAccountId: 1, parentGroupAccountId: null, balanceDirection: "debit", consolidationRole: "none" },
    { groupAccountId: 2, parentGroupAccountId: null, balanceDirection: "debit", consolidationRole: "intercompanyReceivable" },
  ], []);

  assert.equal(usage.get(1)?.consolidation, false);
  assert.equal(usage.get(2)?.consolidation, true);
  assert.equal(matchesFinanceGroupAccountUsage(usage.get(2)!, "consolidation"), true);
});

test("classifies inherited reclassification rules but excludes no-reclassification decisions", () => {
  const revisions = [
    { groupAccountId: 1, parentGroupAccountId: null, balanceDirection: "debit", consolidationRole: "none" },
    { groupAccountId: 2, parentGroupAccountId: 1, balanceDirection: "debit", consolidationRole: "none" },
    { groupAccountId: 3, parentGroupAccountId: null, balanceDirection: "credit", consolidationRole: "none" },
  ];
  const usage = buildGroupAccountUsageById(revisions, [
    {
      id: 10,
      policyVersionId: 1,
      sourceGroupAccountId: 1,
      targetGroupAccountId: 3,
      sourceAccountCode: "1221",
      abnormalSide: "credit",
      decision: "reclassify",
      targetAccountCode: "2241",
      enabled: true,
    },
    {
      id: 11,
      policyVersionId: 1,
      sourceGroupAccountId: 3,
      targetGroupAccountId: null,
      sourceAccountCode: "2241",
      abnormalSide: "debit",
      decision: "no_reclass",
      targetAccountCode: null,
      enabled: true,
    },
  ]);

  assert.equal(usage.get(1)?.reclassification, true);
  assert.equal(usage.get(2)?.reclassification, true);
  assert.equal(usage.get(3)?.reclassification, false);
});
