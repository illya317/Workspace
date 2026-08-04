import assert from "node:assert/strict";
import test from "node:test";

import type { FinanceAssetPeriodRowDto } from "../../types/assets";
import { assetPeriodWorkbook, buildFinanceAssetExportCommand } from "./export-route-commands";

test("asset accounting exports require the selected company and period", () => {
  const missingScope = buildFinanceAssetExportCommand({ view: "cards" });
  assert.equal(missingScope.ok, false);
  if (!missingScope.ok) assert.equal(missingScope.issue.field, "companyCode");
});

test("asset accounting exports accept every workbench view", () => {
  for (const view of ["cards", "period", "adjustments"] as const) {
    assert.equal(buildFinanceAssetExportCommand({
      view,
      companyCode: "FH",
      year: 2026,
      month: 6,
    }).ok, true);
  }
});

function periodRow(overrides: Partial<FinanceAssetPeriodRowDto> = {}): FinanceAssetPeriodRowDto {
  return {
    assetId: 1,
    assetCode: "FA-001",
    name: "测试资产",
    assetKind: "fixed_asset",
    accountCode: "1602",
    depreciationStartDate: "2026-01-01",
    originalCost: 12000,
    residualRate: 0.05,
    usefulLifeMonths: 60,
    initializationMode: "standard",
    impairmentBefore: 0,
    accumulatedBefore: 1900,
    monthlyAmount: 190,
    normalAmount: 190,
    adjustmentAmount: 0,
    periodAmount: 190,
    status: "calculated",
    voucherNo: null,
    ...overrides,
  };
}

test("period workbook keeps the visible parameter chain as formulas for standard rows", () => {
  const workbook = assetPeriodWorkbook([periodRow()], { year: 2026, month: 7 });
  assert.deepEqual(workbook.columns.map((column) => column.header), [
    "资产编号", "资产名称", "累计科目", "起算日期", "原值", "残值率", "残值额", "期限（月）",
    "减值（期初）", "应折旧额", "月折旧额", "期初累计", "正常计算", "调整", "本期入账", "凭证",
  ]);
  const cells = workbook.rows[0]!;
  assert.deepEqual(cells[5], 0.05);
  assert.deepEqual(cells[6], { kind: "formula", formula: "ROUND(E2*F2,2)", cachedValue: 600 });
  assert.deepEqual(cells[9], { kind: "formula", formula: "MAX(0,ROUND(E2-G2-I2,2))", cachedValue: 11400 });
  assert.deepEqual(cells[10], { kind: "formula", formula: "ROUND(J2/H2,2)", cachedValue: 190 });
  assert.deepEqual(cells[11], 1900);
  assert.deepEqual(cells[12], { kind: "formula", formula: "MAX(0,MIN(K2,J2-L2))", cachedValue: 190 });
  assert.deepEqual(cells[14], { kind: "formula", formula: "ROUND(M2+N2,2)", cachedValue: 190 });
  assert.deepEqual(cells[15], "待关联");
});

test("period workbook freezes derived cells when the visible chain misses the backend amount by a cent", () => {
  // 10.05 × 10%：可见残值额 1.01 与后台 cents(原值×(1-残值率)) 口径差一分钱，可见链复核不通过。
  const workbook = assetPeriodWorkbook([periodRow({
    originalCost: 10.05,
    residualRate: 0.1,
    usefulLifeMonths: 2,
    accumulatedBefore: 0,
    monthlyAmount: 4.53,
    normalAmount: 4.53,
    periodAmount: 4.53,
  })], { year: 2026, month: 7 });
  const cells = workbook.rows[0]!;
  assert.deepEqual(cells[6], { kind: "formula", formula: "ROUND(E2*F2,2)", cachedValue: 1.01 });
  assert.deepEqual(cells[9], 9.04);
  assert.deepEqual(cells[10], 4.53);
  assert.deepEqual(cells[12], 4.53);
  assert.deepEqual(cells[14], { kind: "formula", formula: "ROUND(M2+N2,2)", cachedValue: 4.53 });
});

test("period workbook freezes legacy cutover rows that formulas cannot express", () => {
  const workbook = assetPeriodWorkbook([periodRow({
    initializationMode: "legacy_cutover",
    monthlyAmount: null,
    accumulatedBefore: 500,
    normalAmount: 120,
    adjustmentAmount: 30,
    periodAmount: 150,
  })], { year: 2026, month: 7 });
  const cells = workbook.rows[0]!;
  assert.deepEqual(cells[5], "");
  assert.deepEqual(cells[6], "");
  assert.deepEqual(cells[9], "");
  assert.deepEqual(cells[10], "");
  assert.deepEqual(cells[11], 500);
  assert.deepEqual(cells[12], 120);
  assert.deepEqual(cells[13], 30);
  assert.deepEqual(cells[14], { kind: "formula", formula: "ROUND(M2+N2,2)", cachedValue: 150 });
});
