import assert from "node:assert/strict";
import test from "node:test";

import * as xlsx from "xlsx";

import { parseAuxiliaryBalanceSheet } from "./auxiliary-balance-parser";

test("parses supplier auxiliary balances with account codes and sides", () => {
  const buffer = workbookBuffer([
    ["科目编码", "科目名称", "供应商编号", "供应商名称", "方向", "期初余额本币", "借方本币", "贷方本币", "方向20", "期末余额本币"],
    ["2202", "应付账款", "0048", "供应商A", "贷", 100, 2060, 1960, "借", 100],
  ]);
  const preview = parseAuxiliaryBalanceSheet(buffer, "02", 2025, "供应商余额-丰华天力通2025.xls", ".xls");
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.month, 12);
  assert.deepEqual(preview.auxiliaryBalances?.[0], {
    accountCode: "2202",
    accountName: "应付账款",
    dimensionType: "supplier",
    dimensionCode: "0048",
    dimensionName: "供应商A",
    openingDebit: 0,
    openingCredit: 100,
    currentDebit: 2060,
    currentCredit: 1960,
    closingDebit: 100,
    closingCredit: 0,
  });
});

test("infers person settlement accounts and explicit filename month", () => {
  const buffer = workbookBuffer([
    ["部门编码", "部门名称", "个人编码", "个人名称", "方向4", "期初余额", "本期借方发生", "本期贷方发生", "方向8", "期末余额"],
    ["01", "办公室", "F001", "员工A", "平", 0, 50, 70, "贷", 20],
  ]);
  const preview = parseAuxiliaryBalanceSheet(buffer, "02", 2026, "应付个人余额-丰华天力通2026.4.xls", ".xls");
  assert.equal(preview.month, 4);
  assert.equal(preview.auxiliaryBalances?.[0]?.accountCode, "224102");
  assert.equal(preview.auxiliaryBalances?.[0]?.dimensionType, "person");
  assert.equal(preview.auxiliaryBalances?.[0]?.closingCredit, 20);
});

function workbookBuffer(rows: unknown[][]): Buffer {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), "辅助余额");
  return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
