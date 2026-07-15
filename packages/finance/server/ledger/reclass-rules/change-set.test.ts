import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSaveBalanceReclassAdjustmentChangeSetCommand,
  buildSaveReclassRuleChangeSetCommand,
} from "../../domain/finance-validation";

test("reclass rule change set supports save and clear in one command", () => {
  const result = buildSaveReclassRuleChangeSetCommand({
    userId: 1,
    changes: [
      { sourceAccountCode: "1122", abnormalSide: "credit", targetAccountCode: "2203" },
      { sourceAccountCode: "2202", abnormalSide: "debit", targetAccountCode: null },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.changes.length, 2);
  assert.equal(result.data.input.changes[1]?.targetAccountCode, null);
});

test("reclass rule change set rejects duplicate source and side", () => {
  const result = buildSaveReclassRuleChangeSetCommand({
    userId: 1,
    changes: [
      { sourceAccountCode: "1122", abnormalSide: "credit", targetAccountCode: "2203" },
      { sourceAccountCode: "1122", abnormalSide: "credit", targetAccountCode: null },
    ],
  });
  assert.equal(result.ok, false);
});

test("period adjustment change set requires a target distinct from the source", () => {
  const accepted = buildSaveBalanceReclassAdjustmentChangeSetCommand({
    userId: 1,
    changes: [{ periodId: 12, sourceAccountCode: "2202", targetAccountCode: "1123" }],
  });
  assert.equal(accepted.ok, true);

  const rejected = buildSaveBalanceReclassAdjustmentChangeSetCommand({
    userId: 1,
    changes: [{ periodId: 12, sourceAccountCode: "2202", targetAccountCode: "2202" }],
  });
  assert.equal(rejected.ok, false);
});
