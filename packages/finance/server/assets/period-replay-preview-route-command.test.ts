import assert from "node:assert/strict";
import test from "node:test";
import { financeAssetPeriodReplayPreviewSchema } from "./period-replay-preview-schema";
import {
  buildFinanceAssetPeriodReplayPreviewRouteCommand,
  executeFinanceAssetPeriodReplayPreviewRouteCommand,
} from "./period-replay-preview-route-command";

test("schema and route command produce a pure replay preview", () => {
  const parsed = financeAssetPeriodReplayPreviewSchema.safeParse({
    companyCode: " 01 ",
    year: "2026",
    month: "6",
    rows: [{
      sourceKey: "source-row-1",
      assetKind: "fixed_asset",
      originalCost: "1200",
      residualRate: "0",
      usefulLifeMonths: "12",
      acquisitionDate: "2026-05-10",
      depreciationStartDate: "",
      openingAccumulatedAmount: "0",
      openingAsOfDate: "2026-05-31",
      nonAmortizationReason: "",
      sourcePeriodAmountControl: "100",
      sourceClosingNetControl: "1100",
    }],
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) throw new Error(parsed.error.message);

  const built = buildFinanceAssetPeriodReplayPreviewRouteCommand(parsed.data);
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error(built.issue.message);
  assert.equal(built.data.companyCode, "01");
  assert.equal(built.data.rows[0]?.openingImpairmentAmount, 0);
  assert.equal(built.data.rows[0]?.depreciationStartDate, null);

  const preview = executeFinanceAssetPeriodReplayPreviewRouteCommand(built.data);
  assert.equal(preview.rows[0]?.status, "ready");
  assert.equal(preview.rows[0]?.result?.periodAmount, 100);
  assert.equal(preview.diffSummary.periodAmount.differenceRows, 0);
});
