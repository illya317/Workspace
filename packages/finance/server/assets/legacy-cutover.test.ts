import assert from "node:assert/strict";
import test from "node:test";

import { calculateFinanceAssetPeriod } from "./calculator";

const cutover = {
  originalCost: 1_200,
  openingAccumulatedAmount: 800,
  openingImpairmentAmount: 40,
  openingNetBookValue: 360,
  cutoverDate: "2026-06-30",
  remainingUsefulLifeMonthsAtCutover: 3,
  cutoverResidualValue: 60,
};

function calculate(year: number, month: number, accumulatedBefore = 800, impairmentBefore = 40) {
  return calculateFinanceAssetPeriod({
    originalCost: 1_200,
    residualRate: 0.05,
    usefulLifeMonths: 120,
    accumulatedBefore,
    impairmentBefore,
    depreciationStartDate: "2026-07-01",
    year,
    month,
    assetKind: "fixed_asset",
    initializationMode: "legacy_cutover",
    legacyCutover: cutover,
  });
}

test("legacy cutover starts in the month after cutover and does not recalculate history", () => {
  assert.equal(calculate(2026, 6).periodAmount, 0);
  assert.equal(calculate(2026, 7).periodAmount, 100);
});

test("legacy cutover allocates the final cent tail in the last remaining month", () => {
  const basis = { ...cutover, openingNetBookValue: 360.01, openingAccumulatedAmount: 799.99 };
  const first = calculateFinanceAssetPeriod({
    originalCost: 1_200, residualRate: 0.05, usefulLifeMonths: 120, accumulatedBefore: 799.99,
    impairmentBefore: 40, depreciationStartDate: "2026-07-01", year: 2026, month: 7,
    assetKind: "fixed_asset", initializationMode: "legacy_cutover", legacyCutover: basis,
  });
  const second = calculateFinanceAssetPeriod({
    originalCost: 1_200, residualRate: 0.05, usefulLifeMonths: 120, accumulatedBefore: 899.99,
    impairmentBefore: 40, depreciationStartDate: "2026-07-01", year: 2026, month: 8,
    assetKind: "fixed_asset", initializationMode: "legacy_cutover", legacyCutover: basis,
  });
  const last = calculateFinanceAssetPeriod({
    originalCost: 1_200, residualRate: 0.05, usefulLifeMonths: 120, accumulatedBefore: 999.99,
    impairmentBefore: 40, depreciationStartDate: "2026-07-01", year: 2026, month: 9,
    assetKind: "fixed_asset", initializationMode: "legacy_cutover", legacyCutover: basis,
  });
  assert.deepEqual([first.periodAmount, second.periodAmount, last.periodAmount], [100, 100, 100.01]);
  assert.equal(last.netBookValue, 60);
});

test("post-cutover impairment is prospectively spread over the remaining months", () => {
  const result = calculate(2026, 8, 900, 70);
  assert.equal(result.periodAmount, 85);
  assert.equal(result.netBookValue, 145);
});

test("legacy cutover still applies disposal-month semantics", () => {
  const common = {
    originalCost: 1_200, residualRate: 0.05, usefulLifeMonths: 120, accumulatedBefore: 800,
    impairmentBefore: 40, depreciationStartDate: "2026-07-01", year: 2026, month: 7,
    initializationMode: "legacy_cutover" as const, legacyCutover: cutover, disposalDate: "2026-07-20",
  };
  assert.equal(calculateFinanceAssetPeriod({ ...common, assetKind: "fixed_asset" }).periodAmount, 100);
  assert.equal(calculateFinanceAssetPeriod({ ...common, assetKind: "intangible" }).periodAmount, 0);
});
