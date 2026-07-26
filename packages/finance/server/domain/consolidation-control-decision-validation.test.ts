import assert from "node:assert/strict";
import test from "node:test";

import { buildSaveConsolidationControlDecisionCommand } from "./consolidation-batch-validation";

test("setAll expands the five standard controls in one command", () => {
  const result = buildSaveConsolidationControlDecisionCommand(7, {
    expectedRevision: 3,
    mode: "setAll",
    decision: "completed",
  }, 11);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.decisions.map((item) => item.controlKey), [
    "scope",
    "ownership",
    "sources",
    "fx",
    "tax",
  ]);
  assert.equal(result.data.decisions.every((item) => item.decision === "completed"), true);
});

test("setAll can keep the five standard controls in review", () => {
  const result = buildSaveConsolidationControlDecisionCommand(7, {
    expectedRevision: 3,
    mode: "setAll",
    decision: "requiresReview",
  }, 11);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.decisions.length, 5);
  assert.equal(result.data.decisions.every((item) => item.decision === "requiresReview"), true);
  assert.equal(result.data.decisions.every((item) => item.conclusion === "需复核"), true);
});

test("notApplicable remains scoped to an active elimination control", () => {
  const result = buildSaveConsolidationControlDecisionCommand(7, {
    expectedRevision: 3,
    mode: "notApplicable",
    controlKey: "elimination:investmentEquity",
    conclusion: "本期无投资权益抵销事项",
    evidence: "已核对持股链及双方凭证明细",
  }, 11);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.decisions, [{
    controlKey: "elimination:investmentEquity",
    decision: "notApplicable",
    conclusion: "本期无投资权益抵销事项",
    evidence: "已核对持股链及双方凭证明细",
  }]);
});

test("notApplicable rejects deferred elimination controls", () => {
  const result = buildSaveConsolidationControlDecisionCommand(7, {
    expectedRevision: 3,
    mode: "notApplicable",
    controlKey: "elimination:cashFlow",
    conclusion: "无事项",
    evidence: "测试依据",
  }, 11);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "controlKey");
});
