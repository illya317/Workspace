import assert from "node:assert/strict";
import test from "node:test";

import type { AssetWorkbookBlocker } from "./current-period-workbook-types";
import {
  FINANCE_ASSET_GL_OVERRIDE_BLOCKER_CODES,
  gateFinanceAssetLegacyCutoverBlockers,
} from "./legacy-cutover-blocker-gate";

const sourceEvidence = (code: string): AssetWorkbookBlocker => ({
  code,
  message: `原始阻断 ${code}`,
  sourceSheet: "9&10-1",
  sourceRange: "9&10-1!A1:B2",
});

test("allows only the audited GL override list for the 2026-06 legacy cutover", () => {
  const blockers = FINANCE_ASSET_GL_OVERRIDE_BLOCKER_CODES.map(sourceEvidence);
  const result = gateFinanceAssetLegacyCutoverBlockers({
    year: 2026,
    month: 6,
    hasErpGlReconciliation: true,
    blockers,
  });

  assert.equal(result.overrideEnabled, true);
  assert.deepEqual(result.blocking, []);
  assert.equal(result.warnings.length, blockers.length);
  result.warnings.forEach((warning, index) => {
    assert.equal(warning.code, blockers[index]!.code);
    assert.equal(warning.message, blockers[index]!.message);
    assert.equal(warning.sourceSheet, blockers[index]!.sourceSheet);
    assert.equal(warning.sourceRange, blockers[index]!.sourceRange);
    assert.match(warning.note ?? "", /ERP GL reconciliation/);
  });
});

test("keeps every non-audited blocker fail-closed", () => {
  const blocker = sourceEvidence("ASSET_AMOUNT_INVALID");
  const result = gateFinanceAssetLegacyCutoverBlockers({
    year: 2026,
    month: 6,
    hasErpGlReconciliation: true,
    blockers: [blocker],
  });

  assert.deepEqual(result.blocking, [blocker]);
  assert.deepEqual(result.warnings, []);
});

test("does not override blockers outside 2026-06 or without an injected GL reconciler", () => {
  const blocker = sourceEvidence("FIXED_DEPRECIATION_CONTROL_FAILED");
  for (const scope of [
    { year: 2025, month: 6, hasErpGlReconciliation: true },
    { year: 2026, month: 5, hasErpGlReconciliation: true },
    { year: 2026, month: 6, hasErpGlReconciliation: false },
  ]) {
    const result = gateFinanceAssetLegacyCutoverBlockers({ ...scope, blockers: [blocker] });
    assert.deepEqual(result.blocking, [blocker]);
    assert.deepEqual(result.warnings, []);
  }
});
