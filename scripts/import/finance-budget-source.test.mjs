import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import XLSX from "xlsx";

import { parseDepartmentBudgetWorkbook, parseResearchBudgetWorkbook } from "./finance-budget-source.mjs";

function workbook(rows) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-budget-source-"));
  const file = path.join(root, "budget.xlsx");
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "预算");
  XLSX.writeFile(book, file);
  return file;
}

test("department budget parser keeps source labels and twelve monthly amounts", () => {
  const file = workbook([
    ["部门", "科目", "合计"],
    [],
    ["研发部", "办公费", 78, ...Array.from({ length: 12 }, (_, index) => index + 1), "费用"],
  ]);
  const rows = parseDepartmentBudgetWorkbook(file);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    department: "研发部",
    account: "办公费",
    expenseType: "费用",
    total: 78,
    months: Array.from({ length: 12 }, (_, index) => index + 1),
  });
});

test("research budget parser rejects non-numeric amounts", () => {
  const file = workbook([
    ["项目", "科目", "合计"],
    ["项目 A", "研发费", "not-a-number", ...Array(12).fill(0)],
  ]);
  assert.throws(() => parseResearchBudgetWorkbook(file), /不是有效金额/);
});
