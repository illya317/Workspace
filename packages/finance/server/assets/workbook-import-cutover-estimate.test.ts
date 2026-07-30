import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeFinanceAssetCutoverEstimates } from "./workbook-import";

test("recomputes remaining months from the GL-adjusted opening net and annual policy amount", () => {
  const allocation = {
    sourceKey: "9&10-3:3",
    openingAccumulatedAmount: 33_000,
    openingImpairmentAmount: 0,
    openingNetBookValue: 33_000,
    cutoverResidualValue: 0,
    remainingUsefulLifeMonthsAtCutover: 12,
    allocationStatus: "allocated" as const,
    roundingAdjustment: 0,
    ledgerControlAdjustment: -33_000,
    ledgerControlAllocationMode: "replace_single_card_from_gl" as const,
    ledgerControlApprovalReason: "以总账期末余额承接",
    assetBalance: { id: 1, accountId: 1, periodId: 1, companyCode: "TEST" },
    accumulatedBalance: null,
    impairmentBalance: null,
  };
  const canonical = canonicalizeFinanceAssetCutoverEstimates(
    [{ sourceKey: allocation.sourceKey, originalCost: 66_000, fullUsefulLifeMonths: 12, residualRate: 0 }],
    new Map([[allocation.sourceKey, allocation]]),
  ).get(allocation.sourceKey)!;
  assert.equal(canonical.openingNetBookValue, 33_000);
  assert.equal(canonical.cutoverResidualValue, 0);
  assert.equal(canonical.remainingUsefulLifeMonthsAtCutover, 6);
});
