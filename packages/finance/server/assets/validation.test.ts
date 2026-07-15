import assert from "node:assert/strict";
import test from "node:test";

import type { UpdateFinanceAssetCardInput } from "../../types/assets";
import { buildUpdateFinanceAssetCardCommand } from "./validation";

const validInput: UpdateFinanceAssetCardInput = {
  id: 12,
  version: 3,
  companyCode: "02",
  assetCode: "FA-001",
  name: "生产设备",
  assetKind: "fixed_asset",
  assetAccountCode: "1601",
  originalCost: 10000,
  residualRate: 0.03,
  usefulLifeMonths: 60,
  depreciationStartDate: "2026-04-01",
};

test("builds a versioned asset update command", () => {
  const result = buildUpdateFinanceAssetCardCommand(validInput, 7);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.id, 12);
  assert.equal(result.data.input.version, 3);
  assert.equal(result.data.userId, 7);
});

test("rejects asset updates without a valid version", () => {
  const result = buildUpdateFinanceAssetCardCommand({ ...validInput, version: 0 }, 7);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "version");
});
