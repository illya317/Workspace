import assert from "node:assert/strict";
import test from "node:test";

import { buildSaveFinanceConsolidationScopeSelectionCommand } from "./consolidation-scope-selection-validation";

const validInput = {
  parentCompanyId: 1,
  year: 2026,
  month: 6,
  periodKind: "quarter" as const,
  companyId: 2,
  relationId: 20,
  expectedRelationVersion: 3,
  included: false,
};

test("accepts a Finance period-scoped consolidation selection", () => {
  const result = buildSaveFinanceConsolidationScopeSelectionCommand(validInput, 9);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.input, validInput);
});

test("rejects a quarter selection outside a quarter-end month", () => {
  const result = buildSaveFinanceConsolidationScopeSelectionCommand({
    ...validInput,
    month: 5,
  }, 9);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "month");
});
