import assert from "node:assert/strict";
import test from "node:test";

import { calculateFinanceAssetPeriod, calculateStraightLinePeriod } from "./calculator";

test("calculates fixed-asset straight-line depreciation with residual value", () => {
  const result = calculateStraightLinePeriod({
    originalCost: 120000,
    residualRate: 0.03,
    usefulLifeMonths: 60,
    accumulatedBefore: 0,
    depreciationStartDate: "2026-05-01",
    year: 2026,
    month: 5,
  });
  assert.equal(result.monthlyAmount, 1940);
  assert.equal(result.periodAmount, 1940);
  assert.equal(result.netBookValue, 118060);
});

test("uses the corrected April start for the 66,000 prepaid item", () => {
  const april = calculateStraightLinePeriod({
    originalCost: 66000,
    residualRate: 0,
    usefulLifeMonths: 12,
    accumulatedBefore: 0,
    depreciationStartDate: "2026-04-01",
    year: 2026,
    month: 4,
  });
  const may = calculateStraightLinePeriod({
    originalCost: 66000,
    residualRate: 0,
    usefulLifeMonths: 12,
    accumulatedBefore: april.accumulatedAfter,
    depreciationStartDate: "2026-04-01",
    year: 2026,
    month: 5,
  });
  assert.equal(april.periodAmount, 5500);
  assert.equal(may.periodAmount, 5500);
  assert.equal(may.accumulatedAfter, 11000);
});

test("caps the final period and leaves manual adjustments outside the formula", () => {
  const result = calculateStraightLinePeriod({
    originalCost: 1000,
    residualRate: 0.03,
    usefulLifeMonths: 3,
    accumulatedBefore: 646.67,
    depreciationStartDate: "2026-03-01",
    year: 2026,
    month: 5,
  });
  assert.equal(result.monthlyAmount, 323.33);
  assert.equal(result.periodAmount, 323.33);
  assert.equal(result.accumulatedAfter, 970);
  assert.equal(result.netBookValue, 30);
});

test("uses asset-kind-specific disposal-month semantics", () => {
  const input = { originalCost: 1200, residualRate: 0, usefulLifeMonths: 12, accumulatedBefore: 500, depreciationStartDate: "2026-01-01", year: 2026, month: 6, disposalDate: "2026-06-20" };
  assert.equal(calculateFinanceAssetPeriod({ ...input, assetKind: "fixed_asset" }).periodAmount, 100);
  assert.equal(calculateFinanceAssetPeriod({ ...input, assetKind: "intangible" }).periodAmount, 0);
  assert.equal(calculateFinanceAssetPeriod({ ...input, assetKind: "prepaid" }).lifecycleBlocker, "asset_termination_policy_missing");
  assert.equal(calculateFinanceAssetPeriod({ ...input, assetKind: "long_term_deferred" }).lifecycleBlocker, "asset_termination_policy_missing");
});
