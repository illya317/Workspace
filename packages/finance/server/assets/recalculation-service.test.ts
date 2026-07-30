import assert from "node:assert/strict";
import test from "node:test";

import {
  recalculateFinanceAssetPeriod,
  type FinanceAssetRecalculationDependencies,
} from "./recalculation-service";

const baseCard = {
  id: 1,
  assetCode: "ZX02-FA-MACHINERY-2026-00001",
  assetKind: "fixed_asset",
  originalCost: 1200,
  residualRate: 0.03,
  usefulLifeMonths: 12,
  depreciationStartDate: "2026-01-01",
  method: "straight_line",
  openingAccumulatedAmount: 0,
  openingAsOfDate: null,
  initializationMode: "standard",
  openingImpairmentAmount: 0,
  openingNetBookValue: null,
  cutoverDate: null,
  remainingUsefulLifeMonthsAtCutover: null,
  cutoverResidualValue: null,
  cutoverAllocationStatus: null,
  disposal: null,
};

test("recalculation fails closed instead of skipping a card without a start date", async () => {
  const harness = recalculationHarness({ ...baseCard, depreciationStartDate: null });

  await assert.rejects(
    () => recalculateFinanceAssetPeriod({ companyCode: "ZX02", year: 2026, month: 6 }, harness.dependencies),
    /缺少折旧摊销起算日期，不能静默跳过重算/,
  );
  assert.equal(harness.listCalls, 0);
});

test("recalculation refuses a card snapshot whose method is not implemented", async () => {
  const harness = recalculationHarness({ ...baseCard, method: "declining_balance" });

  await assert.rejects(
    () => recalculateFinanceAssetPeriod({ companyCode: "ZX02", year: 2026, month: 6 }, harness.dependencies),
    /当前仅支持直线法/,
  );
  assert.equal(harness.listCalls, 0);
});

test("legacy cutover writes July from remaining carrying amount and no June history row", async () => {
  const legacy = {
    ...baseCard,
    initializationMode: "legacy_cutover",
    openingAccumulatedAmount: 800,
    openingImpairmentAmount: 40,
    openingNetBookValue: 360,
    openingAsOfDate: "2026-06-30",
    cutoverDate: "2026-06-30",
    depreciationStartDate: "2026-07-01",
    remainingUsefulLifeMonthsAtCutover: 3,
    cutoverResidualValue: 60,
    cutoverAllocationStatus: "allocated",
  };
  const june = recalculationHarness(legacy, { year: 2026, month: 6, endDate: "2026-06-30" });
  await recalculateFinanceAssetPeriod({ companyCode: "ZX02", year: 2026, month: 6 }, june.dependencies);
  assert.equal(june.upserts.length, 0);

  const july = recalculationHarness(legacy, { year: 2026, month: 7, endDate: "2026-07-31" });
  await recalculateFinanceAssetPeriod({ companyCode: "ZX02", year: 2026, month: 7 }, july.dependencies);
  assert.equal(july.upserts[0]?.normalAmount, 100);
  assert.equal(july.upserts[0]?.calculationVersion, "legacy-cutover-remaining-value-v1");
});

test("pending cutover allocation does not generate a future depreciation row", async () => {
  const harness = recalculationHarness({
    ...baseCard,
    initializationMode: "legacy_cutover",
    openingAccumulatedAmount: 800,
    openingImpairmentAmount: 0,
    openingNetBookValue: 400,
    openingAsOfDate: "2026-06-30",
    cutoverDate: "2026-06-30",
    depreciationStartDate: "2026-07-01",
    remainingUsefulLifeMonthsAtCutover: 3,
    cutoverResidualValue: 40,
    cutoverAllocationStatus: "pending",
  }, { year: 2026, month: 7, endDate: "2026-07-31" });
  await recalculateFinanceAssetPeriod({ companyCode: "ZX02", year: 2026, month: 7 }, harness.dependencies);
  assert.equal(harness.upserts.length, 0);
});

test("pending cutover allocation rejects a stale current-period depreciation row", async () => {
  const harness = recalculationHarness({
    ...baseCard,
    initializationMode: "legacy_cutover",
    openingAccumulatedAmount: 800,
    openingImpairmentAmount: 0,
    openingNetBookValue: 400,
    openingAsOfDate: "2026-06-30",
    cutoverDate: "2026-06-30",
    depreciationStartDate: "2026-07-01",
    remainingUsefulLifeMonthsAtCutover: 3,
    cutoverResidualValue: 40,
    cutoverAllocationStatus: "pending",
  }, { year: 2026, month: 7, endDate: "2026-07-31" }, [{ id: 77, assetId: 1, status: "calculated", voucherId: null }]);
  await assert.rejects(
    () => recalculateFinanceAssetPeriod({ companyCode: "ZX02", year: 2026, month: 7 }, harness.dependencies),
    /必须先清理已有折旧摊销条目/,
  );
});

function recalculationHarness(
  card: typeof baseCard | { [key: string]: unknown },
  scope: { year: number; month: number; endDate: string } = { year: 2026, month: 6, endDate: "2026-06-30" },
  currentEntries: Array<{ id: number; assetId: number; status: string; voucherId: number | null }> = [],
) {
  let listCalls = 0;
  const upserts: Array<Record<string, unknown>> = [];
  const tx = {
    financePeriod: {
      findUnique: async () => ({ id: 60, isClosed: false, startDate: `${scope.year}-${String(scope.month).padStart(2, "0")}-01`, endDate: scope.endDate }),
    },
    financeAssetCard: {
      findMany: async () => [card],
    },
    financeAssetPeriodEntry: {
      findMany: async (args: { where: { periodId?: number } }) => args.where.periodId ? currentEntries : [],
      upsert: async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        upserts.push(args.create);
        return { id: 1 };
      },
    },
    financeAssetAdjustment: {
      findMany: async () => [],
    },
    financeAssetImpairmentAllocation: {
      findMany: async () => [],
    },
  };
  const dependencies: FinanceAssetRecalculationDependencies = {
    database: {
      $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    } as unknown as FinanceAssetRecalculationDependencies["database"],
    listWorkspace: (async () => {
      listCalls += 1;
      return {};
    }) as unknown as FinanceAssetRecalculationDependencies["listWorkspace"],
  };
  return {
    dependencies,
    upserts,
    get listCalls() {
      return listCalls;
    },
  };
}
