import { NextResponse } from "next/server";
import { withFinanceAccess } from "@/lib/with-auth";
import * as xlsx from "xlsx";
import * as path from "path";
import * as fs from "fs";

interface DeptBudgetItem {
  dept: string;
  account: string;
  total: number;
  months: number[];
  expenseType: string;
}

interface RdBudgetItem {
  project: string;
  category: string;
  total: number;
  months: number[];
}

function readDeptBudget(): DeptBudgetItem[] {
  const filePath = path.join(
    process.cwd(),
    "prisma/seed-data/预算/部门费用预算数据.xlsx",
  );
  const buf = fs.readFileSync(filePath);
  const wb = xlsx.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  const items: DeptBudgetItem[] = [];
  // Row 1 is real header: 部门, 科目, 合计, 1月, ..., 12月, 费用类型
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 3) continue;

    const dept = String(row[0] || "").trim();
    const account = String(row[1] || "").trim();

    // Skip summary rows
    if (!dept || !account) continue;
    if (account === "合计") continue;
    if (["福利费", "薪资", "其他", "科目", "部门"].includes(dept)) continue;

    const total = Number(row[2] || 0);
    const months: number[] = [];
    for (let m = 0; m < 12; m++) {
      months.push(Number(row[3 + m] || 0));
    }
    const expenseType = String(row[15] || "").trim();
    if (!expenseType) continue; // skip rows without expense type

    items.push({ dept, account, total, months, expenseType });
  }
  return items;
}

function readRdBudget(): RdBudgetItem[] {
  const filePath = path.join(
    process.cwd(),
    "prisma/seed-data/预算/研发费用预算数据.xlsx",
  );
  const buf = fs.readFileSync(filePath);
  const wb = xlsx.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  const items: RdBudgetItem[] = [];
  // Row 0 is header: 研发项目, 产品类别, 汇总, 1月, ..., 12月
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 3) continue;

    const project = String(row[0] || "").trim();
    const category = String(row[1] || "").trim();

    // Skip summary rows
    if (!project || !category) continue;
    if (category === "小计" || category === "合计") continue;
    if (project === "总计") continue;

    const total = Number(row[2] || 0);
    const months: number[] = [];
    for (let m = 0; m < 12; m++) {
      months.push(Number(row[3 + m] || 0));
    }

    items.push({ project, category, total, months });
  }
  return items;
}

export const GET = withFinanceAccess(async () => {
  try {
    const deptBudget = readDeptBudget();
    const rdBudget = readRdBudget();
    return NextResponse.json({ deptBudget, rdBudget });
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取预算数据失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
