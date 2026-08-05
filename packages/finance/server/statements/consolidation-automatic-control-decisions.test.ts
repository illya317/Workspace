import assert from "node:assert/strict";
import test from "node:test";

import { desiredAutomaticDecision } from "./consolidation-automatic-control-decisions";

test("keeps an unclassified investment difference as a blocking automatic decision", () => {
  const decision = desiredAutomaticDecision("investmentEquity", [{
    entryType: "investmentEquity",
    title: "期初投资与权益抵销",
    differenceAmount: 1_835_138.48,
    conclusion: "待分类差额",
    evidence: "缺少购买日依据",
  }], new Set());
  assert.equal(decision?.decision, "requiresReview");
  assert.match(decision?.evidence ?? "", /1835138\.48/);
});

test("does not create a no-item decision when a generated entry exists", () => {
  assert.equal(desiredAutomaticDecision("nonControllingInterest", [], new Set(["nonControllingInterest"])), null);
  assert.equal(desiredAutomaticDecision("cashFlow", [], new Set())?.decision, "notApplicable");
});
