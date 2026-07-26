import assert from "node:assert/strict";
import test from "node:test";
import { parseMonthlyCostSheet } from "./finance-cost-structure-workbook.mjs";

test("extracts both product statuses from only the first contiguous monthly table", () => {
  const rows = Array.from({ length: 12 }, () => []);
  rows[5] = ["产成品", "产品A", 10, 100, 20, 30, 4, null, 5, 6, 1, 7, 8, 9, 10, 50, 1000, 0.2];
  rows[6] = [null, "产品B", 11, 101, 21, 31, 5, null, 6, 7, 2, 8, 9, 10, 11, 58, 2000, 0.1];
  rows[7] = ["在产品", "在产A", 12, 102, 22, 32, 6, null, 7, 8, 3, 9, 10, 11, 12, 66, null, "#DIV/0!"];
  rows[8] = [];
  rows[9] = ["产成品", "第二张表的重复行", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1000, 0.01];

  const result = parseMonthlyCostSheet(rows, {
    sourceFile: "26年成本汇总构成表.xls",
    sheetName: "26.3月",
    year: 2026,
    month: 3,
  });

  assert.equal(result.length, 3);
  assert.deepEqual(result.map((row) => row.productStatus), ["产成品", "产成品", "在产品"]);
  assert.equal(result[2].inboundQuantity, null);
  assert.equal(result[2].source.row, 8);
  assert.equal(result.some((row) => row.productName.includes("第二张表")), false);
});
