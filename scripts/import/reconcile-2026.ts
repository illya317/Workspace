/**
 * 五家公司 2026年(1-4月) 余额表核对
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";
import { reconcileBalanceSheet } from "../../server/services/finance/ledger/balance-reconcile";
import { CODE_TO_NAME } from "../../lib/company";

const ROOT = path.resolve(__dirname, "../..");
const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? path.join(ROOT, "data/dev.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });
const SEED = path.join(ROOT, "prisma/seed-data/财务数据");

const COMPANIES: Record<string, string> = {
  "01": "丰华生物/余额表-丰华生物2026.04.xls",
  "02": "天力通/余额表-天力通2026.4.xls",
  "03": "丰华悦通/丰华悦通/余额表-丰华悦通 2026.4.xlsx",
  "05": "加拿大/余额表-加拿大2026.3.xls",
  "06": "上海悦通/余额表-上海悦通2026.4.xls",
};

async function main() {
  console.log("📊 2026 年度余额表核对\n");

  for (const [code, relativePath] of Object.entries(COMPANIES)) {
    const name = CODE_TO_NAME[code] || code;
    const filePath = path.join(SEED, relativePath);
    if (!fs.existsSync(filePath)) { console.log(`  ❌ ${code} ${name}: 文件不存在\n`); continue; }

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase() || ".xls";

    try {
      const result = await reconcileBalanceSheet(buffer, code, ext);
      const diffs = result.differences.length;

      console.log(`  ${code} ${name}:`);
      console.log(`    期间: ${result.year}.${String(result.monthStart).padStart(2,"0")}-${result.year}.${String(result.monthEnd).padStart(2,"0")}`);
      console.log(`    Excel ${result.excelRowCount} 行 | 系统 ${result.systemAccountCount} 科目`);
      console.log(`    匹配 ${result.matchedCount} | 差异 ${diffs}`);

      if (result.missingInSystem.length > 0) console.log(`    ⚠ Excel有系统无: ${result.missingInSystem.length} 科目`);
      if (result.missingInSystem.length <= 5) for (const m of result.missingInSystem) console.log(`      ${m.code} ${m.name}`);

      if (diffs > 0) {
        const big = result.differences.filter(d => Math.abs(d.diff) > 100);
        if (big.length > 0) {
          console.log(`    大额差异(>100):`);
          for (const d of big.slice(0, 15)) {
            console.log(`      ${d.accountCode} ${d.accountName} ${d.field}: Excel=${d.excelValue.toLocaleString()} Sys=${d.systemValue.toLocaleString()} Δ${d.diff.toLocaleString()}`);
          }
          if (big.length > 15) console.log(`      ...+${big.length-15}条`);
        }
      }
      if (diffs === 0) console.log("    ✅ 完全一致");
      console.log();
    } catch (e: any) {
      console.log(`  ❌ ${code} ${name}: ${e.message}\n`);
    }
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
