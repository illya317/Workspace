import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import { parseFinancialStatementWorkbook } from "./source-workbook";

function workbookBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["资产负债表"],
    ["编制单位：测试公司"],
    ["货币资金", 90, 100, "短期借款", 40, 50],
  ]), "资产负债表");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["利润表", "2026年"],
    ["单位：测试公司"],
    ["营业收入", 80, 120],
  ]), "利润表");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["现金流量表"],
    ["单位：测试公司"],
    ["销售商品、提供劳务收到的现金", 70, 110],
  ]), "现金流量表");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("financial statement workbook parser is reusable from uploaded buffers", () => {
  const parsed = parseFinancialStatementWorkbook(workbookBuffer(), 2025);
  assert.equal(parsed.companyText, "测试公司");
  assert.deepEqual(parsed.sheets.map((sheet) => sheet.reportType), [
    "balanceSheet",
    "incomeStatement",
    "cashFlow",
  ]);
  assert.equal(parsed.sheets[0]?.currentYear, 2026);
  assert.deepEqual(parsed.sheets[0]?.lines[0], {
    lineCode: "cash",
    previousAmount: 90,
    currentAmount: 100,
    sourceLabel: "货币资金",
    sortOrder: 2,
  });
  assert.equal(parsed.sheets[1]?.lines[0]?.currentAmount, 120);
  assert.equal(parsed.sheets[2]?.lines[0]?.currentAmount, 110);
});
