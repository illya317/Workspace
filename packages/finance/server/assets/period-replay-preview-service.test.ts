import assert from "node:assert/strict";
import test from "node:test";
import { previewFinanceAssetPeriodReplay } from "./period-replay-preview-service";
import {
  buildFinanceAssetPeriodReplayPreviewCommand,
  type FinanceAssetPeriodReplayPreviewRowInput,
} from "./period-replay-preview-validation";

function row(
  overrides: Partial<FinanceAssetPeriodReplayPreviewRowInput> = {},
): FinanceAssetPeriodReplayPreviewRowInput {
  return {
    sourceKey: "asset-1",
    assetKind: "fixed_asset",
    originalCost: 1200,
    residualRate: 0,
    usefulLifeMonths: 12,
    acquisitionDate: "2026-05-10",
    depreciationStartDate: null,
    openingAccumulatedAmount: 0,
    openingImpairmentAmount: 0,
    openingAsOfDate: "2026-05-31",
    nonAmortizationReason: null,
    sourcePeriodAmountControl: 100,
    sourceClosingNetControl: 1100,
    ...overrides,
  };
}

function preview(rows: FinanceAssetPeriodReplayPreviewRowInput[]) {
  const command = buildFinanceAssetPeriodReplayPreviewCommand({ companyCode: "01", year: 2026, month: 6, rows });
  assert.equal(command.ok, true);
  if (!command.ok) throw new Error("preview command rejected valid replay fixture");
  return previewFinanceAssetPeriodReplay(command.data);
}

test("fixed assets derive the production start date from acquisition and replay June", () => {
  const result = preview([row()]);
  const item = result.rows[0]!;
  assert.equal(item.status, "ready");
  assert.deepEqual(item.blockers, []);
  assert.equal(item.result?.depreciationStartDate, "2026-06-01");
  assert.equal(item.result?.depreciationStartDateRule, "fixed_asset_first_day_next_month_after_acquisition");
  assert.equal(item.result?.periodAmount, 100);
  assert.equal(item.result?.closingAccumulatedAmount, 100);
  assert.equal(item.result?.closingNetBookValue, 1100);
  assert.equal(item.controls.periodAmountMatches, true);
  assert.equal(item.controls.closingNetMatches, true);
  assert.deepEqual(result.diffSummary, {
    rowCount: 1,
    readyRowCount: 1,
    blockerRowCount: 0,
    periodAmount: {
      comparableRows: 1,
      matchedRows: 1,
      differenceRows: 0,
      calculatedTotal: 100,
      sourceControlTotal: 100,
      differenceTotal: 0,
      absoluteDifferenceTotal: 0,
    },
    closingNet: {
      comparableRows: 1,
      matchedRows: 1,
      differenceRows: 0,
      calculatedTotal: 1100,
      sourceControlTotal: 1100,
      differenceTotal: 0,
      absoluteDifferenceTotal: 0,
    },
  });
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

test("source controls are comparison-only and never change the calculation", () => {
  const matching = preview([row()]);
  const different = preview([row({ sourcePeriodAmountControl: 999, sourceClosingNetControl: 1 })]);
  assert.deepEqual(different.rows[0]?.result, matching.rows[0]?.result);
  assert.equal(different.rows[0]?.controls.periodAmountDifference, -899);
  assert.equal(different.rows[0]?.controls.closingNetDifference, 1099);
  assert.notEqual(different.fingerprint, matching.fingerprint);
});

test("missing life produces zero only at residual or with an explicit non-amortization basis", () => {
  const result = preview([
    row({
      sourceKey: "at-residual",
      assetKind: "prepaid",
      originalCost: 100,
      residualRate: 0.1,
      usefulLifeMonths: null,
      acquisitionDate: "2020-01-01",
      openingAccumulatedAmount: 90,
      sourcePeriodAmountControl: 0,
      sourceClosingNetControl: 10,
    }),
    row({
      sourceKey: "explicit-basis",
      assetKind: "intangible",
      originalCost: 100,
      usefulLifeMonths: null,
      acquisitionDate: "2020-01-01",
      nonAmortizationReason: "使用寿命不确定，复核前不自动摊销",
      sourcePeriodAmountControl: 0,
      sourceClosingNetControl: 100,
    }),
  ]);
  assert.equal(result.rows[0]?.status, "ready");
  assert.equal(result.rows[0]?.result?.rule, "fully_depreciated_to_residual");
  assert.equal(result.rows[0]?.result?.periodAmount, 0);
  assert.equal(result.rows[1]?.status, "ready");
  assert.equal(result.rows[1]?.result?.rule, "explicit_non_amortization");
  assert.equal(result.rows[1]?.result?.periodAmount, 0);
});

test("legacy zero-net openings and one-cent residual rounding remain zero without importing a period result", () => {
  const result = preview([
    row({
      sourceKey: "legacy-zero-net",
      originalCost: 100,
      residualRate: 0.03,
      usefulLifeMonths: null,
      openingAccumulatedAmount: 100,
      sourcePeriodAmountControl: 0,
      sourceClosingNetControl: 0,
    }),
    row({
      sourceKey: "residual-rounding-cent",
      originalCost: 10_388.5,
      residualRate: 0.03,
      usefulLifeMonths: null,
      openingAccumulatedAmount: 10_076.85,
      sourcePeriodAmountControl: 0,
      sourceClosingNetControl: 311.65,
    }),
  ]);
  assert.equal(result.rows[0]?.status, "ready");
  assert.equal(result.rows[0]?.result?.rule, "legacy_fully_depreciated");
  assert.equal(result.rows[0]?.result?.periodAmount, 0);
  assert.equal(result.rows[0]?.result?.closingNetBookValue, 0);
  assert.equal(result.rows[1]?.status, "ready");
  assert.equal(result.rows[1]?.result?.rule, "fully_depreciated_to_residual");
  assert.equal(result.rows[1]?.result?.periodAmount, 0);
  assert.equal(result.rows[1]?.result?.closingNetBookValue, 311.65);
});

test("row business defects are returned as blockers without aborting the preview", () => {
  const result = preview([
    row({
      sourceKey: "bad-intangible",
      assetKind: "intangible",
      usefulLifeMonths: null,
      acquisitionDate: "2020-01-01",
      depreciationStartDate: null,
      openingAsOfDate: "2026-04-30",
    }),
  ]);
  assert.equal(result.rows[0]?.status, "blocked");
  assert.equal(result.rows[0]?.result, null);
  assert.deepEqual(result.rows[0]?.blockers.map((item) => item.code).sort(), [
    "depreciation_start_date_required",
    "opening_date_not_prior_month_end",
    "useful_life_required",
  ]);
  assert.equal(result.diffSummary.readyRowCount, 0);
  assert.equal(result.diffSummary.blockerRowCount, 1);
});

test("fingerprint is deterministic across row order and duplicate keys block every duplicate", () => {
  const second = row({
    sourceKey: "asset-2",
    assetKind: "long_term_deferred",
    acquisitionDate: "2020-01-01",
    depreciationStartDate: "2026-06-01",
  });
  assert.equal(preview([row(), second]).fingerprint, preview([second, row()]).fingerprint);

  const duplicates = preview([row(), row({ sourcePeriodAmountControl: 101 })]);
  assert.equal(duplicates.rows.every((item) => item.status === "blocked"), true);
  assert.equal(duplicates.rows.every((item) => item.blockers.some((blocker) => blocker.code === "duplicate_source_key")), true);
});
