import assert from "node:assert/strict";
import test from "node:test";

import { inspectImportReferenceGovernance } from "./check-import-reference-governance.mjs";

test("import reference governance covers every handler and ratchets schema debt", () => {
  const result = inspectImportReferenceGovernance();
  assert.deepEqual(result.errors, []);
  assert.equal(result.handlerCount >= 1, true);
  assert.equal(result.currentCandidates.includes("FinanceConsolidationBatch.parentCompanyId"), false);
  assert.equal(result.currentCandidates.includes("FinanceConsolidationEntryLine.accountCode"), false);
  assert.equal(result.currentCandidates.includes("FinanceBudgetVersion.companyCode"), false);
  assert.equal(result.currentCandidates.includes("FinanceBudgetDept.dept"), false);
  assert.equal(result.currentCandidates.includes("FinanceGroupAccount.originLocalAccountCode"), false);
  assert.equal(result.currentCandidates.includes("FinanceStatementSourcePackage.parsedCompanyName"), false);
  assert.equal(result.currentCandidates.includes("User.employeeId"), false);
});
