import * as xlsx from "xlsx";
import * as path from "path";
import * as fs from "fs";
import { prisma } from "@/lib/prisma";

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

// ---- DB import ----

async function resolveAccountIds(names: string[]) {
  const accounts = await prisma.financeAccount.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
  return new Map(accounts.map((a) => [a.name, a.id]));
}

export async function importDeptBudgetToDb(
  year: number,
  companyCode: string | undefined,
  versionId: number,
) {
  const raw = readDeptBudget();
  const accountMap = await resolveAccountIds(raw.map((i) => i.account));

  const data = raw.map((item) => ({
    versionId,
    year,
    companyCode: companyCode ?? null,
    dept: item.dept,
    accountName: item.account,
    expenseType: item.expenseType,
    accountId: accountMap.get(item.account) ?? null,
    total: item.total,
    month1: item.months[0] ?? 0,
    month2: item.months[1] ?? 0,
    month3: item.months[2] ?? 0,
    month4: item.months[3] ?? 0,
    month5: item.months[4] ?? 0,
    month6: item.months[5] ?? 0,
    month7: item.months[6] ?? 0,
    month8: item.months[7] ?? 0,
    month9: item.months[8] ?? 0,
    month10: item.months[9] ?? 0,
    month11: item.months[10] ?? 0,
    month12: item.months[11] ?? 0,
    sourceFile: "部门费用预算数据.xlsx",
  }));

  await prisma.financeBudgetDept.createMany({ data });
  return data.length;
}

export async function importRdBudgetToDb(
  year: number,
  companyCode: string | undefined,
  versionId: number,
) {
  const raw = readRdBudget();
  const accountMap = await resolveAccountIds(raw.map((i) => i.category));

  const data = raw.map((item) => ({
    versionId,
    year,
    companyCode: companyCode ?? null,
    project: item.project,
    category: item.category,
    accountId: accountMap.get(item.category) ?? null,
    total: item.total,
    month1: item.months[0] ?? 0,
    month2: item.months[1] ?? 0,
    month3: item.months[2] ?? 0,
    month4: item.months[3] ?? 0,
    month5: item.months[4] ?? 0,
    month6: item.months[5] ?? 0,
    month7: item.months[6] ?? 0,
    month8: item.months[7] ?? 0,
    month9: item.months[8] ?? 0,
    month10: item.months[9] ?? 0,
    month11: item.months[10] ?? 0,
    month12: item.months[11] ?? 0,
    sourceFile: "研发费用预算数据.xlsx",
  }));

  await prisma.financeBudgetRd.createMany({ data });
  return data.length;
}

// ---- DB read ----

export async function loadDeptBudgetFromDb(versionId: number) {
  const rows = await prisma.financeBudgetDept.findMany({
    where: { versionId },
    include: { account: { select: { id: true, code: true, isActive: true } } },
  });
  return rows.map((r) => ({
    dept: r.dept,
    account: r.accountName,
    total: r.total,
    months: [r.month1, r.month2, r.month3, r.month4, r.month5, r.month6, r.month7, r.month8, r.month9, r.month10, r.month11, r.month12],
    expenseType: r.expenseType,
    accountId: r.account?.id ?? null,
    accountCode: r.account?.code ?? null,
    accountActive: r.account?.isActive ?? null,
  }));
}

export async function loadRdBudgetFromDb(versionId: number) {
  const rows = await prisma.financeBudgetRd.findMany({
    where: { versionId },
    include: { account: { select: { id: true, code: true, isActive: true } } },
  });
  return rows.map((r) => ({
    project: r.project,
    category: r.category,
    total: r.total,
    months: [r.month1, r.month2, r.month3, r.month4, r.month5, r.month6, r.month7, r.month8, r.month9, r.month10, r.month11, r.month12],
    accountId: r.account?.id ?? null,
    accountCode: r.account?.code ?? null,
    accountActive: r.account?.isActive ?? null,
  }));
}
