import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSaveBalanceReclassAdjustmentChangeSetCommand,
  buildSaveReclassRuleChangeSetCommand,
} from "../validation";

test("reclass rule change set supports save and clear in one command", () => {
  const result = buildSaveReclassRuleChangeSetCommand({
    userId: 1,
    policyVersionId: 3,
    changes: [
      { sourceGroupAccountId: 1122, abnormalSide: "credit", targetGroupAccountId: 2203 },
      { sourceGroupAccountId: 2202, abnormalSide: "debit", targetGroupAccountId: null },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.changes.length, 2);
  assert.equal(result.data.input.changes[1]?.targetGroupAccountId, null);
});

test("reclass rule change set rejects duplicate source and side", () => {
  const result = buildSaveReclassRuleChangeSetCommand({
    userId: 1,
    policyVersionId: 3,
    changes: [
      { sourceGroupAccountId: 1122, abnormalSide: "credit", targetGroupAccountId: 2203 },
      { sourceGroupAccountId: 1122, abnormalSide: "credit", targetGroupAccountId: null },
    ],
  });
  assert.equal(result.ok, false);
});

test("reclass rule change set rejects a group-account self target", () => {
  const result = buildSaveReclassRuleChangeSetCommand({
    userId: 1,
    policyVersionId: 3,
    changes: [{ sourceGroupAccountId: 1122, abnormalSide: "credit", targetGroupAccountId: 1122 }],
  });
  assert.equal(result.ok, false);
});

test("reclass rule change set accepts an explicit valid basis and defaults to null", () => {
  const explicit = buildSaveReclassRuleChangeSetCommand({
    userId: 1,
    policyVersionId: 3,
    changes: [{ sourceGroupAccountId: 1122, abnormalSide: "credit", targetGroupAccountId: 2203, basis: "counterparty_gross" }],
  });
  assert.equal(explicit.ok, true);
  if (explicit.ok) assert.equal(explicit.data.input.changes[0]?.basis, "counterparty_gross");

  const omitted = buildSaveReclassRuleChangeSetCommand({
    userId: 1,
    policyVersionId: 3,
    changes: [{ sourceGroupAccountId: 1122, abnormalSide: "credit", targetGroupAccountId: 2203 }],
  });
  assert.equal(omitted.ok, true);
  if (omitted.ok) assert.equal(omitted.data.input.changes[0]?.basis, null);
});

test("reclass rule change set rejects an invalid basis", () => {
  const result = buildSaveReclassRuleChangeSetCommand({
    userId: 1,
    policyVersionId: 3,
    changes: [{ sourceGroupAccountId: 1122, abnormalSide: "credit", targetGroupAccountId: 2203, basis: "gross" as never }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue.message, /计算口径无效/);
});

test("period adjustment change set requires a target distinct from the source", () => {
  const accepted = buildSaveBalanceReclassAdjustmentChangeSetCommand({
    userId: 1,
    changes: [{
      operation: "manual",
      periodId: 12,
      sourceAccountCode: "2202",
      decision: "reclassify",
      targetAccountCode: "1123",
    }],
  });
  assert.equal(accepted.ok, true);

  const rejected = buildSaveBalanceReclassAdjustmentChangeSetCommand({
    userId: 1,
    changes: [{
      operation: "manual",
      periodId: 12,
      sourceAccountCode: "2202",
      decision: "reclassify",
      targetAccountCode: "2202",
    }],
  });
  assert.equal(rejected.ok, false);
});

test("period adjustment supports manual no-process and restore-auto commands", () => {
  const manualNoProcess = buildSaveBalanceReclassAdjustmentChangeSetCommand({
    userId: 1,
    changes: [{
      operation: "manual",
      periodId: 12,
      sourceAccountCode: "2202",
      decision: "no_reclass",
      targetAccountCode: null,
    }],
  });
  assert.equal(manualNoProcess.ok, true);

  const restoreAuto = buildSaveBalanceReclassAdjustmentChangeSetCommand({
    userId: 1,
    changes: [{ operation: "restore_auto", periodId: 12, sourceAccountCode: "2202" }],
  });
  assert.equal(restoreAuto.ok, true);
});
