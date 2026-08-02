import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectAssetDepreciationCloseFacts,
  inspectAssetImpairmentCloseFacts,
  inspectAssetMovementCloseFacts,
  type AssetDepreciationCloseFacts,
  type AssetMovementCloseFacts,
} from "./close-provider";
import type { AssetCloseCard } from "./close-provider-evidence";

const scope = { companyCode: "ZX02", year: 2026, month: 6 };
const policy = {
  categoryId: 10, policyId: 100, assetAccountCode: "1601", assetAccountId: 1601,
  accumulatedAccountCode: "1602", accumulatedAccountId: 1602, expenseAccountCode: "6602",
  impairmentLossAccountCode: "6701", impairmentAllowanceAccountCode: "1608", disposalGainLossAccountCode: "6711",
};
const voucher = {
  id: 30, voucherNo: "记-30", status: "posted", companyCode: "ZX02", periodId: 6, totalDebit: 100, totalCredit: 100,
  items: [{ id: 3, accountCode: "1602", debit: 0, credit: 100 }, { id: 4, accountCode: "6602", debit: 100, credit: 0 }],
};

function card(status = "active"): AssetCloseCard {
  return {
    id: 1, companyCode: "ZX02", companyId: 2, version: 1, status, categoryId: 10,
    assetCode: "ZX02-FA-2026-00001", name: "生产设备", assetKind: "fixed_asset",
    acquisitionDate: "2026-06-01", depreciationStartDate: "2026-06-01", originalCost: 6000,
    residualRate: 0, usefulLifeMonths: 60, method: "straight_line", openingAccumulatedAmount: 0,
    openingImpairmentAmount: 0, initializationMode: "standard", openingAsOfDate: null,
    nonAmortizationReason: null, sourceFile: "assets.xlsx", sourceRow: 4, acquisitionEvidence: null,
    disposal: null, category: { code: "FA-MACHINERY", name: "机器设备", depreciable: true },
    assetAccountCode: "1601", assetAccountId: 1601, accumulatedAccountCode: "1602", accumulatedAccountId: 1602,
  };
}

function movement(overrides: Partial<AssetMovementCloseFacts> = {}): AssetMovementCloseFacts {
  return {
    period: { id: 6 }, cards: [card()], policies: [policy], applicabilityEstablished: true, assetGlBalance: 6000,
    entries: [], adjustments: [], priorEntries: [], priorAdjustments: [], priorImpairments: [], ...overrides,
  };
}

function depreciation(overrides: Partial<AssetDepreciationCloseFacts> = {}): AssetDepreciationCloseFacts {
  return {
    ...movement(), entries: [{ id: 20, assetId: 1, normalAmount: 100, status: "posted", voucher }],
    ledgerByAccount: [{ accountCode: "1602", amount: 100 }], ...overrides,
  };
}

test("an empty asset scope is ready only when annual policies establish zero GL applicability", () => {
  const notApplicable = inspectAssetMovementCloseFacts(scope, movement({ cards: [], assetGlBalance: 0 }));
  assert.equal(notApplicable.status, "ready");
  assert.equal((notApplicable.payload as { applicable: boolean }).applicable, false);
  assert.equal(inspectAssetMovementCloseFacts(scope, movement({ cards: [], policies: [], applicabilityEstablished: false })).status, "blocked");
  assert.equal(inspectAssetDepreciationCloseFacts(scope, depreciation({ cards: [], assetGlBalance: 50, entries: [] })).status, "blocked");
});

test("invalid replay fact permutations preserve depreciation blockers and inspection fingerprint", () => {
  const priorEntries = [
    { assetId: 1, normalAmount: 10, status: "draft", periodId: 5, periodEndDate: "2026-05-31", voucher: null },
    { assetId: 1, normalAmount: 20, status: "calculated", periodId: 4, periodEndDate: "2026-04-30", voucher: null },
    { assetId: 1, normalAmount: 30, status: "draft", periodId: 3, periodEndDate: "2026-03-31", voucher: null },
  ];
  const ordered = inspectAssetDepreciationCloseFacts(scope, depreciation({ priorEntries }));
  const permuted = inspectAssetDepreciationCloseFacts(scope, depreciation({ priorEntries: [...priorEntries].reverse() }));
  assert.deepEqual(ordered.blockers, permuted.blockers);
  assert.equal(ordered.inputFingerprint, permuted.inputFingerprint);
});

test("asset close provider deep links use only registered asset workspace views", () => {
  const inspections = [
    inspectAssetMovementCloseFacts(scope, movement({ cards: [card("disposed")] })),
    inspectAssetDepreciationCloseFacts(scope, depreciation({ ledgerByAccount: [{ accountCode: "1602", amount: 90 }] })),
    inspectAssetImpairmentCloseFacts(scope, { period: { id: 6 }, cards: [card()], policies: [policy], assessment: null, entries: [], adjustments: [], priorEntries: [], priorAdjustments: [], priorImpairments: [] }),
  ];
  const links = inspections.flatMap((inspection) => [inspection.deepLink, ...inspection.blockers.map((blocker) => blocker.deepLink)]);
  assert.deepEqual([...new Set(links.map((link) => new URL(link, "http://workspace.test").searchParams.get("view")))].sort(), ["adjustments", "cards", "period"]);
  assert.equal(links.every((link) => ["cards", "period", "adjustments"].includes(new URL(link, "http://workspace.test").searchParams.get("view") ?? "")), true);
});
