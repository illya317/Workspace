import assert from "node:assert/strict";
import test from "node:test";
import { financeAssetCreateCommandMatches, type FinanceAssetCardIdempotencyFields } from "./asset-card-idempotency";

const card: FinanceAssetCardIdempotencyFields = {
  companyCode: "02",
  assetCode: "02-FA-ELECTRONIC-2026-00007",
  name: "MacBook Pro",
  assetKind: "fixed_asset",
  categoryId: 4,
  assetAccountCode: "1601",
  accumulatedAccountCode: "1602",
  acquisitionDate: "2026-07-01",
  depreciationStartDate: "2026-08-01",
  originalCost: "12000.00",
  residualRate: "0.03",
  usefulLifeMonths: 60,
  method: "straight_line",
  openingAccumulatedAmount: "0.00",
  openingAsOfDate: null,
  nonAmortizationReason: null,
  note: null,
  editedBy: 7,
};

test("accepts an exact manual asset-create replay", () => {
  assert.equal(financeAssetCreateCommandMatches(card, { ...card, originalCost: 12000, residualRate: 0.03 }), true);
});

test("rejects reuse of the same manual request key for different content", () => {
  assert.equal(financeAssetCreateCommandMatches(card, { ...card, name: "Different asset" }), false);
  assert.equal(financeAssetCreateCommandMatches(card, { ...card, originalCost: 13000 }), false);
});
