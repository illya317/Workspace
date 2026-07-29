#!/usr/bin/env node

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { requireDatabaseUrl } from "../lib/database-url.js";
import { parseDepartmentBudgetWorkbook, parseResearchBudgetWorkbook } from "./finance-budget-source.mjs";

const execute = process.argv.includes("--execute");
const option = (key) => process.argv.find((argument) => argument.startsWith(`--${key}=`))?.slice(key.length + 3) ?? null;
const required = (key) => option(key) || (() => { throw new Error(`缺少 --${key}=...`); })();

const year = Number(required("year"));
const companyCode = required("company-code").trim();
const versionName = required("version-name").trim();
const releaseId = required("release-id").trim();
const departmentFile = path.resolve(required("department-file"));
const researchFile = path.resolve(required("research-file"));
const referenceFile = path.resolve(required("reference-file"));

if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new Error("year 必须是 2000-2099 的整数");
if (!companyCode || !versionName || !releaseId) throw new Error("company-code、version-name 与 release-id 不能为空");
for (const file of [departmentFile, researchFile, referenceFile]) {
  if (!path.isAbsolute(file) || !fs.existsSync(file)) throw new Error(`输入文件不存在：${file}`);
}

const references = JSON.parse(fs.readFileSync(referenceFile, "utf8"));
for (const key of ["departments", "projects", "accounts"]) {
  if (!references[key] || typeof references[key] !== "object" || Array.isArray(references[key])) {
    throw new Error(`引用映射必须包含对象字段 ${key}`);
  }
}

const departmentRows = parseDepartmentBudgetWorkbook(departmentFile);
const researchRows = parseResearchBudgetWorkbook(researchFile);
if (departmentRows.length === 0 && researchRows.length === 0) throw new Error("预算源文件没有可导入数据");

const { PrismaClient } = await import("../../generated/prisma/client.ts");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: requireDatabaseUrl(), application_name: "workspace-finance-budget-import" }),
});

function chooseUnique(items, description) {
  if (items.length !== 1) throw new Error(`${description} 应唯一命中主数据，实际 ${items.length} 条`);
  return items[0];
}

function monthColumns(values) {
  return Object.fromEntries(values.map((value, index) => [`month${index + 1}`, value]));
}

async function resolveDepartment(tx, raw) {
  const mappedCode = references.departments[raw];
  const rows = await tx.department.findMany({
    where: { isArchived: false, ...(mappedCode ? { code: String(mappedCode) } : { name: raw }) },
    select: { id: true, code: true, name: true },
    take: 2,
  });
  return chooseUnique(rows, `部门“${raw}”${mappedCode ? `（映射编码 ${mappedCode}）` : ""}`);
}

async function resolveProject(tx, raw) {
  const mappedCode = references.projects[raw];
  const rows = await tx.project.findMany({
    where: { isArchived: false, ...(mappedCode ? { code: String(mappedCode) } : { name: raw }) },
    select: { id: true, code: true, name: true },
    take: 2,
  });
  return chooseUnique(rows, `项目“${raw}”${mappedCode ? `（映射编码 ${mappedCode}）` : ""}`);
}

async function resolveAccount(tx, raw) {
  const mappedCode = references.accounts[raw];
  const rows = await tx.financeAccount.findMany({
    where: {
      companyCode,
      isActive: true,
      OR: [{ year }, { year: null }],
      ...(mappedCode ? { code: String(mappedCode) } : { name: raw }),
    },
    select: { id: true, code: true, name: true, year: true },
  });
  const exactYear = rows.filter((row) => row.year === year);
  return chooseUnique(exactYear.length > 0 ? exactYear : rows, `科目“${raw}”${mappedCode ? `（映射编码 ${mappedCode}）` : ""}`);
}

async function buildPlan(tx) {
  const company = await tx.company.findUnique({ where: { code: companyCode }, select: { id: true, code: true } });
  if (!company) throw new Error(`公司编码不存在：${companyCode}`);

  const departments = new Map();
  const projects = new Map();
  const accounts = new Map();
  for (const raw of new Set(departmentRows.map((row) => row.department))) departments.set(raw, await resolveDepartment(tx, raw));
  for (const raw of new Set(researchRows.map((row) => row.project))) projects.set(raw, await resolveProject(tx, raw));
  for (const raw of new Set([...departmentRows.map((row) => row.account), ...researchRows.map((row) => row.account)])) {
    accounts.set(raw, await resolveAccount(tx, raw));
  }
  return { company, departments, projects, accounts };
}

async function main() {
  const preview = await prisma.$transaction((tx) => buildPlan(tx));
  const summary = {
    mode: execute ? "execute" : "dry-run",
    releaseId,
    year,
    companyCode: preview.company.code,
    departmentRows: departmentRows.length,
    researchRows: researchRows.length,
    departments: preview.departments.size,
    projects: preview.projects.size,
    accounts: preview.accounts.size,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!execute) return;

  const sourceKey = `data-release:${releaseId}`;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace-finance-budget:${releaseId}`}))`;
    const existing = await tx.financeBudgetVersion.findMany({ where: { sourceFile: sourceKey }, select: { id: true }, take: 2 });
    if (existing.length > 1) throw new Error(`数据发布 ${releaseId} 已对应多个预算版本`);
    if (existing.length === 1) {
      const [deptCount, rdCount] = await Promise.all([
        tx.financeBudgetDept.count({ where: { versionId: existing[0].id } }),
        tx.financeBudgetRd.count({ where: { versionId: existing[0].id } }),
      ]);
      if (deptCount !== departmentRows.length || rdCount !== researchRows.length) {
        throw new Error(`数据发布 ${releaseId} 已存在但行数不一致，拒绝覆盖`);
      }
      return { versionId: existing[0].id, deptCount, rdCount, replay: true };
    }

    const plan = await buildPlan(tx);
    const version = await tx.financeBudgetVersion.create({
      data: {
        year,
        companyId: plan.company.id,
        companyCode,
        name: versionName,
        status: "draft",
        type: "all",
        sourceFile: sourceKey,
      },
    });
    await tx.financeBudgetDept.createMany({
      data: departmentRows.map((row) => ({
        versionId: version.id,
        year,
        departmentId: plan.departments.get(row.department).id,
        dept: row.department,
        accountId: plan.accounts.get(row.account).id,
        accountName: row.account,
        expenseType: row.expenseType,
        total: row.total,
        ...monthColumns(row.months),
        sourceFile: path.basename(departmentFile),
      })),
    });
    await tx.financeBudgetRd.createMany({
      data: researchRows.map((row) => ({
        versionId: version.id,
        year,
        projectId: plan.projects.get(row.project).id,
        project: row.project,
        accountId: plan.accounts.get(row.account).id,
        category: row.account,
        total: row.total,
        ...monthColumns(row.months),
        sourceFile: path.basename(researchFile),
      })),
    });
    return { versionId: version.id, deptCount: departmentRows.length, rdCount: researchRows.length, replay: false };
  }, { timeout: 120000 });
  console.log(JSON.stringify({ completed: true, ...result }, null, 2));
}

main().finally(() => prisma.$disconnect());
