import assert from "node:assert/strict";
import test from "node:test";

import { assetPeriodParameters, type AssetPeriodParameterBasis, type AssetPeriodParameterPriors } from "./period-parameters";

function basis(overrides: Partial<AssetPeriodParameterBasis> = {}): AssetPeriodParameterBasis {
  return {
    id: 1,
    initializationMode: "standard",
    originalCost: 12000,
    residualRate: 0.05,
    usefulLifeMonths: 60,
    openingAccumulatedAmount: 100,
    openingImpairmentAmount: 0,
    openingAsOfDate: "2026-03-31",
    ...overrides,
  };
}

function priors(overrides: Partial<AssetPeriodParameterPriors> = {}): AssetPeriodParameterPriors {
  return { entries: [], adjustments: [], impairments: [], ...overrides };
}

test("replays only facts after the opening cut-off into the opening accumulated amount", () => {
  const result = assetPeriodParameters(basis(), priors({
    entries: [
      { assetId: 1, normalAmount: 190, periodEndDate: "2026-04-30" },
      { assetId: 1, normalAmount: 190, periodEndDate: "2026-03-31" },
      { assetId: 2, normalAmount: 999, periodEndDate: "2026-04-30" },
    ],
    adjustments: [{ assetId: 1, amount: 20, periodEndDate: "2026-05-31" }],
  }));
  assert.equal(result.accumulatedBefore, 310);
});

test("standard assets count every prior impairment while legacy cutover assets count only post-opening ones", () => {
  const impairmentPriors = priors({
    impairments: [
      { assetId: 1, amount: 30, periodEndDate: "2026-02-28" },
      { assetId: 1, amount: 40, periodEndDate: "2026-04-30" },
    ],
  });
  assert.equal(assetPeriodParameters(basis({ openingImpairmentAmount: 5 }), impairmentPriors).impairmentBefore, 75);
  assert.equal(
    assetPeriodParameters(basis({ initializationMode: "legacy_cutover", openingImpairmentAmount: 5 }), impairmentPriors).impairmentBefore,
    45,
  );
});

test("derives the straight-line monthly amount only for unimpaired standard assets with a finite life", () => {
  assert.equal(assetPeriodParameters(basis(), priors()).monthlyAmount, 190);
  assert.equal(assetPeriodParameters(basis({ usefulLifeMonths: null }), priors()).monthlyAmount, null);
  assert.equal(
    assetPeriodParameters(basis(), priors({ impairments: [{ assetId: 1, amount: 10, periodEndDate: "2026-04-30" }] })).monthlyAmount,
    null,
  );
  assert.equal(assetPeriodParameters(basis({ initializationMode: "legacy_cutover" }), priors()).monthlyAmount, null);
});
