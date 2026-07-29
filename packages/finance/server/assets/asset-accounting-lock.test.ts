import assert from "node:assert/strict";
import test from "node:test";

import type { FinanceAssetCardCreateCommand } from "./validation";
import { assetCardWriteData } from "./asset-card-write-policy";
import { assetAccountingBasisChanged } from "./service";

const basis = {
  companyCode: "ZX02",
  assetCode: "ZX02-FA-2026-00001",
  name: "生产设备",
  assetKind: "fixed_asset",
  categoryId: 2,
  assetAccountCode: "1601",
  assetAccountId: 1601,
  accumulatedAccountCode: "1602",
  accumulatedAccountId: 1602,
  acquisitionDate: "2026-01-01",
  depreciationStartDate: "2026-02-01",
  originalCost: 10000,
  residualRate: 0.03,
  usefulLifeMonths: 60,
  method: "straight_line",
  openingAccumulatedAmount: 0,
  openingImpairmentAmount: 0,
  openingNetBookValue: null,
  openingAsOfDate: null,
  initializationMode: "standard",
  cutoverDate: null,
  remainingUsefulLifeMonthsAtCutover: null,
  cutoverResidualValue: null,
  cutoverAllocationStatus: null,
  cutoverReconciliationFingerprint: null,
  cutoverPeriodId: null,
  cutoverAssetBalanceId: null,
  cutoverAccumulatedBalanceId: null,
  cutoverImpairmentBalanceId: null,
  nonAmortizationReason: null,
  note: null,
  editedBy: 7,
} satisfies ReturnType<typeof assetCardWriteData>;

test("accounting-basis lock ignores display fields but detects governed basis changes", () => {
  const oldDisplay = { ...basis, name: "旧名称", note: "旧备注" };
  const newDisplay = { ...basis, name: "新名称", note: "新备注" };
  assert.equal(assetAccountingBasisChanged(oldDisplay, newDisplay), false);
  assert.equal(assetAccountingBasisChanged(basis, { ...basis, originalCost: 10001 }), true);
  assert.equal(assetAccountingBasisChanged(basis, { ...basis, categoryId: 3 }), true);
  assert.equal(assetAccountingBasisChanged({ ...basis, assetAccountId: null }, basis), true);
  assert.equal(assetAccountingBasisChanged(basis, { ...basis, usefulLifeMonths: 72 }), true);
  assert.equal(assetAccountingBasisChanged(basis, { ...basis, openingAccumulatedAmount: 100 }), true);
});

test("the service write mapper refuses to persist a method the calculator does not implement", () => {
  const input = {
    companyCode: "ZX02",
    idempotencyKey: "7d7b637a-e24d-4f0b-a8eb-246bb2436561",
    name: "生产设备",
    assetKind: "fixed_asset",
    categoryId: 2,
    accountYear: 2026,
    depreciationStartDate: "2026-02-01",
    originalCost: 10000,
    residualRatePercent: 3,
    usefulLifeMonths: 60,
    method: "declining_balance",
  } as unknown as FinanceAssetCardCreateCommand["input"];
  const accounts = {
    asset: { id: 1601, code: "1601", name: "固定资产" },
    accumulated: { id: 1602, code: "1602", name: "累计折旧" },
  };

  assert.throws(
    () => assetCardWriteData(input, accounts, 7, "ZX02-FA-2026-00001"),
    /当前仅支持直线法/,
  );
});
