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

function recalculationHarness(card: typeof baseCard | { [key: string]: unknown }) {
  let listCalls = 0;
  const tx = {
    financePeriod: {
      findUnique: async () => ({ id: 60, isClosed: false, startDate: "2026-06-01" }),
    },
    financeAssetCard: {
      findMany: async () => [card],
    },
    financeAssetPeriodEntry: {
      findMany: async () => [],
      upsert: async () => ({ id: 1 }),
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
    get listCalls() {
      return listCalls;
    },
  };
}
