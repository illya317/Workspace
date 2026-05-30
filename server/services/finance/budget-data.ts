import * as xlsx from "xlsx";
import * as path from "path";
import * as fs from "fs";

export interface DeptBudgetItem {
  dept: string;
  account: string;
  total: number;
  months: number[];
  expenseType: string;
}

export interface RdBudgetItem {
  project: string;
  category: string;
  total: number;
  months: number[];
}

export function readDeptBudget(): DeptBudgetItem[] {
  const filePath = path.join(process.cwd(), "prisma/seed-data/预算/部门费用预算数据.xlsx");
  const buf = fs.readFileSync(filePath);
  const wb = xlsx.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  const items: DeptBudgetItem[] = [];
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 3) continue;
    const dept = String(row[0] || "").trim();
    const account = String(row[1] || "").trim();
    if (!dept || !account) continue;
    if (account === "合计") continue;
    if (["福利费", "薪资", "其他", "科目", "部门"].includes(dept)) continue;

    const total = Number(row[2] || 0);
    const months: number[] = [];
    for (let m = 0; m < 12; m++) months.push(Number(row[3 + m] || 0));
    const expenseType = String(row[15] || "").trim();
    if (!expenseType) continue;
    items.push({ dept, account, total, months, expenseType });
  }
  return items;
}

export function readRdBudget(): RdBudgetItem[] {
  const filePath = path.join(process.cwd(), "prisma/seed-data/预算/研发费用预算数据.xlsx");
  const buf = fs.readFileSync(filePath);
  const wb = xlsx.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  const items: RdBudgetItem[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 3) continue;
    const project = String(row[0] || "").trim();
    const category = String(row[1] || "").trim();
    if (!project || !category) continue;
    if (category === "小计" || category === "合计") continue;
    if (project === "总计") continue;

    const total = Number(row[2] || 0);
    const months: number[] = [];
    for (let m = 0; m < 12; m++) months.push(Number(row[3 + m] || 0));
    items.push({ project, category, total, months });
  }
  return items;
}
