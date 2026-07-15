/**
 * Import statutory balance sheet, income statement, and cash flow workpapers.
 *
 * Usage:
 *   npx tsx scripts/import-financial-statement-workpapers.ts --source-dir=/path/to/files
 *   npx tsx scripts/import-financial-statement-workpapers.ts --source-dir=/path/to/files --execute
 */
import "dotenv/config";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { requireDatabaseUrl } from "./lib/database-url.js";
import {
  readFinancialStatementWorkbook,
  type ImportedStatementSheet,
} from "@workspace/finance/server/statements/source-workbook";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: requireDatabaseUrl(), application_name: "workspace-financial-statement-import" }),
});
const execute = process.argv.includes("--execute");
const sourceArg = process.argv.find((arg) => arg.startsWith("--source-dir="));
if (!sourceArg) throw new Error("缺少 --source-dir=/path/to/files");
const sourceDir = path.resolve(sourceArg.slice("--source-dir=".length));
const includeArg = process.argv.find((arg) => arg.startsWith("--include="));
const includes = includeArg?.slice("--include=".length).split(",").map((value) => value.trim()).filter(Boolean) ?? [];

function normalizedCompany(value: string) {
  return value.replace(/[\s　:：]/g, "").replace(/(有限责任公司|股份有限公司|有限公司)$/g, "");
}

async function writeSheet(companyCode: string, file: string, sheet: ImportedStatementSheet) {
  for (const year of [sheet.previousYear, sheet.currentYear]) {
    const workpaper = await prisma.financeStatementWorkpaper.upsert({
      where: { companyCode_year_month_reportType: { companyCode, year, month: 12, reportType: sheet.reportType } },
      create: { companyCode, year, month: 12, reportType: sheet.reportType, status: "submitted", note: `导入自 ${file}` },
      update: { status: "submitted", note: `导入自 ${file}`, version: { increment: 1 } },
    });
    await prisma.financeStatementWorkpaperLine.deleteMany({ where: { workpaperId: workpaper.id } });
    const key = year === sheet.currentYear ? "currentAmount" : "previousAmount";
    await prisma.financeStatementWorkpaperLine.createMany({
      data: sheet.lines.map((line) => ({
        workpaperId: workpaper.id,
        lineCode: line.lineCode,
        importedAmount: line[key],
        source: file,
        note: line.sourceLabel,
        sortOrder: line.sortOrder,
      })),
    });
  }
}

async function main() {
  const companies = await prisma.company.findMany({ select: { code: true, name: true } });
  const files = (await readdir(sourceDir))
    .filter((file) => /财务报表.*\.xlsx$/i.test(file))
    .filter((file) => includes.length === 0 || includes.some((value) => file.includes(value)))
    .sort();
  if (files.length === 0) throw new Error(`没有找到财务报表 xlsx: ${sourceDir}`);
  for (const file of files) {
    const parsed = readFinancialStatementWorkbook(path.join(sourceDir, file));
    const sourceName = normalizedCompany(parsed.companyText);
    const company = companies.find((candidate) => sourceName.includes(normalizedCompany(candidate.name)));
    if (!company) throw new Error(`无法从“${parsed.companyText}”匹配公司主数据`);
    const summary = parsed.sheets.map((sheet) => `${sheet.reportType}:${sheet.lines.length}`).join(", ");
    console.log(`${execute ? "IMPORT" : "DRY-RUN"} ${file} -> ${company.code} ${company.name} (${summary})`);
    if (execute) {
      for (const sheet of parsed.sheets) await writeSheet(company.code, file, sheet);
    }
  }
}

main().finally(() => prisma.$disconnect());
