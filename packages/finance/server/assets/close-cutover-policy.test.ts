import assert from "node:assert/strict";
import test from "node:test";
import { inspectAssetDepreciationCloseFacts, inspectAssetMovementCloseFacts } from "./close-provider";
import type { AssetCloseCard, AssetDepreciationCloseFacts, AssetMovementCloseFacts } from "./close-provider-evidence";

const scope = { companyCode: "ZX02", year: 2026, month: 6 };
const policy = {
  categoryId: 10,
  policyId: 100,
  assetAccountCode: "1601",
  assetAccountId: 1601,
  accumulatedAccountCode: "1602",
  accumulatedAccountId: 1602,
  expenseAccountCode: "6602",
  impairmentLossAccountCode: "6701",
  impairmentAllowanceAccountCode: "1608",
  disposalGainLossAccountCode: "6711",
};
const cutoverCard = {
  id: 1,
  companyCode: "ZX02",
  companyId: 2,
  version: 1,
  status: "active",
  categoryId: 10,
  assetCode: "ZX02-FA-2026-00001",
  name: "生产设备",
  assetKind: "fixed_asset",
  acquisitionDate: null,
  depreciationStartDate: "2026-07-01",
  originalCost: 6000,
  residualRate: 0,
  openingAccumulatedAmount: 900,
  initializationMode: "legacy_cutover",
  openingImpairmentAmount: 0,
  openingNetBookValue: 5100,
  openingAsOfDate: "2026-06-30",
  cutoverDate: "2026-06-30",
  remainingUsefulLifeMonthsAtCutover: 51,
  cutoverResidualValue: 0,
  cutoverAllocationStatus: "allocated",
  cutoverReconciliationFingerprint: null,
  sourceFile: "assets.xlsx",
  sourceRow: 4,
  acquisitionEvidence: null,
  usefulLifeMonths: 60,
  method: "straight_line",
  assetAccountCode: "1601",
  assetAccountId: 1601,
  accumulatedAccountCode: "1602",
  accumulatedAccountId: 1602,
  nonAmortizationReason: null,
  disposal: null,
  category: { code: "FA-MACHINERY", name: "机器设备", depreciable: true },
} satisfies AssetCloseCard;

const movementFacts = {
  period: { id: 6 }, cards: [cutoverCard], policies: [policy], applicabilityEstablished: true,
  assetGlBalance: 6000, entries: [], adjustments: [], priorEntries: [], priorAdjustments: [], priorImpairments: [],
} satisfies AssetMovementCloseFacts;

const depreciationFacts = {
  ...movementFacts,
  period: { id: 6, sourceClosed: true },
  ledgerByAccount: [{ accountCode: "1602", amount: 900 }],
  ledgerVoucherIds: [30],
} satisfies AssetDepreciationCloseFacts;

test("controlled June-30 cutover openings do not require fabricated acquisition dates or June depreciation rows", () => {
  const movement = inspectAssetMovementCloseFacts(scope, movementFacts);
  assert.equal(movement.status, "ready");
  assert.equal(movement.blockers.some((item) => item.code === "asset_acquisition_date_missing"), false);

  const depreciation = inspectAssetDepreciationCloseFacts(scope, depreciationFacts);
  assert.equal(depreciation.status, "ready");
  assert.equal(depreciation.contributorVersion, "asset-depreciation-close-v2+source-closed-cutover-v1");
  assert.deepEqual(depreciation.voucherRefs, ["finance-voucher:30"]);
});
