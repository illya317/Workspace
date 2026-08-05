import fs from "node:fs";

import XLSX from "xlsx";

// The SheetJS ESM build does not bind Node fs; readFile/writeFile require an explicit binding.
XLSX.set_fs(fs);

function rowsFromWorkbook(file) {
  if (!fs.existsSync(file)) throw new Error(`预算源文件不存在：${file}`);
  const workbook = XLSX.readFile(file);
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error(`预算源文件没有工作表：${file}`);
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, raw: true });
}

function amount(value, label) {
  const normalized = value === null || value === undefined || value === "" ? 0 : Number(value);
  if (!Number.isFinite(normalized)) throw new Error(`${label} 不是有效金额`);
  return normalized;
}

function months(row, rowNumber) {
  return Array.from({ length: 12 }, (_, index) => amount(row[3 + index], `第 ${rowNumber} 行第 ${index + 1} 月`));
}

export function parseDepartmentBudgetWorkbook(file) {
  const rows = rowsFromWorkbook(file);
  const items = [];
  for (let index = 2; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row) || row.length < 3) continue;
    const department = String(row[0] ?? "").trim();
    const account = String(row[1] ?? "").trim();
    if (!department || !account || account === "合计") continue;
    if (["福利费", "薪资", "其他", "科目", "部门"].includes(department)) continue;
    const expenseType = String(row[15] ?? "").trim();
    if (!expenseType) continue;
    items.push({
      department,
      account,
      expenseType,
      total: amount(row[2], `第 ${index + 1} 行合计`),
      months: months(row, index + 1),
    });
  }
  return items;
}

export function parseResearchBudgetWorkbook(file) {
  const rows = rowsFromWorkbook(file);
  const items = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row) || row.length < 3) continue;
    const project = String(row[0] ?? "").trim();
    const account = String(row[1] ?? "").trim();
    if (!project || !account || account === "小计" || account === "合计" || project === "总计") continue;
    items.push({
      project,
      account,
      total: amount(row[2], `第 ${index + 1} 行合计`),
      months: months(row, index + 1),
    });
  }
  return items;
}
