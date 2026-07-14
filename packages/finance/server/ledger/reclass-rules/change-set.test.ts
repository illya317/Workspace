import assert from "node:assert/strict";
import test from "node:test";

import { buildSaveReclassRuleChangeSetCommand } from "../../domain/finance-validation";

test("reclass rule change set supports save and clear in one command", () => {
  const result = buildSaveReclassRuleChangeSetCommand({
    companyCode: "02",
    year: 2025,
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
    companyCode: "02",
    year: 2025,
    userId: 1,
    changes: [
      { sourceAccountCode: "1122", abnormalSide: "credit", targetAccountCode: "2203" },
      { sourceAccountCode: "1122", abnormalSide: "credit", targetAccountCode: null },
    ],
  });
  assert.equal(result.ok, false);
});
