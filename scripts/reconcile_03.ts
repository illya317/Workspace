import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { reconcileBalanceSheet, ReconcileResult } from "../server/services/finance/ledger/balance-reconcile";
const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });

async function main() {
  const filePath = "prisma/seed-data/财务数据/丰华悦通/丰华悦通/余额表-丰华悦通 2025.xlsx";
  const buffer = fs.readFileSync(filePath);
  const result = await reconcileBalanceSheet(buffer, "03", ".xlsx");

  console.log("═══════════════════════════════════════");
  console.log(`  03 丰华悦通 2025 年度余额表核对报告`);
  console.log("═══════════════════════════════════════\n");
  console.log(`  Excel 科目数:  ${result.excelRowCount}`);
  console.log(`  系统科目数:    ${result.systemAccountCount}`);
  console.log(`  完全匹配:      ${result.matchedCount}`);
  console.log(`  差异科目:      ${result.differences.length}`);
  console.log(`  Excel有系统无: ${result.missingInSystem.length}`);
  console.log(`  系统有Excel无: ${result.missingInExcel.length}\n`);

  if (result.differences.length > 0) {
    console.log("  ── 差异明细 ──");
    // Show all differences (there are only ~6)
    for (const d of result.differences) {
      console.log(`  ${d.accountCode} ${d.accountName}`);
      console.log(`    ${d.field}: Excel=${d.excelValue.toLocaleString()}  系统=${d.systemValue.toLocaleString()}  差额=${d.diff.toLocaleString()}`);
    }
  }

  if (result.missingInSystem.length > 0) {
    console.log(`\n  ── Excel有但系统无 (${result.missingInSystem.length}个) ──`);
    for (const m of result.missingInSystem) {
      console.log(`  ${m.code} ${m.name}`);
    }
  }

  if (result.differences.length === 0) {
    console.log("  ✅ 所有匹配科目完全一致\n");
  }

  await p.$disconnect();
}
main();
