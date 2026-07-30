import assert from "node:assert/strict";
import test from "node:test";

import type { UpdateFinanceAssetCardInput } from "../../types/assets";
import { createFinanceAssetCardSchema } from "./schemas";
import { buildUpdateFinanceAssetCardCommand } from "./validation";

const input: UpdateFinanceAssetCardInput = {
  id: 12, version: 3, companyCode: "ZX02", assetCode: "FA-001", name: "生产设备",
  assetKind: "fixed_asset", categoryId: 2, accountYear: 2026, originalCost: 10000,
  residualRatePercent: 3, usefulLifeMonths: 60, depreciationStartDate: "2026-04-01",
};
const category = {
  id: 2, code: "FA-MACHINERY", name: "机器设备", assetKind: "fixed_asset" as const,
  assetAccount: { id: 1601, code: "1601", name: "固定资产" },
  accumulatedAccount: { id: 1602, code: "1602", name: "累计折旧" }, expenseAccount: null,
  defaultUsefulLifeMonths: 120, defaultResidualRate: 0.03, defaultMethod: "straight_line",
  usefulLifeMode: "required" as const, minimumUsefulLifeMonths: 1, maximumUsefulLifeMonths: null,
  reviewRequired: false,
};

test("the API schema exposes only the canonical straight-line method", () => {
  const request = { ...input, idempotencyKey: "7d7b637a-e24d-4f0b-a8eb-246bb2436561" };
  assert.equal(createFinanceAssetCardSchema.safeParse({ ...request, method: "straight_line" }).success, true);
  assert.equal(createFinanceAssetCardSchema.safeParse({ ...request, method: "declining_balance" }).success, false);
});

test("domain validation rejects unsupported card and annual-policy methods", async () => {
  const unsupportedCard = await buildUpdateFinanceAssetCardCommand(
    { ...input, method: "declining_balance" } as unknown as UpdateFinanceAssetCardInput,
    7,
    { findCategory: async () => category },
  );
  assert.equal(unsupportedCard.ok, false);
  if (!unsupportedCard.ok) assert.equal(unsupportedCard.issue.field, "method");

  const unsupportedPolicy = await buildUpdateFinanceAssetCardCommand(input, 7, {
    findCategory: async () => ({ ...category, defaultMethod: "declining_balance" }),
  });
  assert.equal(unsupportedPolicy.ok, false);
  if (!unsupportedPolicy.ok) assert.equal(unsupportedPolicy.issue.field, "method");
});
