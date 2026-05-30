/**
 * 五家公司 2025 年度余额表核对
 * 用法: npx tsx scripts/import/reconcile-2025.ts
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";
import { reconcileBalanceSheet } from "../../server/services/finance/balance-reconcile";
import { CODE_TO_NAME } from "../../lib/company";

const ROOT = path.resolve(__dirname, "../..");
const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? path.join(ROOT, "data/dev.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

const SEED_DIR = path.join(ROOT, "prisma/seed-data/财务数据");

const COMPANIES: Record<string, string> = {
  "01": "丰华生物/余额表-丰华生物2025.xls",
  "02": "天力通/余额表-天力通2025.xls",
  "03": "丰华悦通/丰华悦通/余额表-丰华悦通 2025.xlsx",
  "05": "加拿大/余额表-加拿大2025.xls",
  "06": "上海悦通/余额表-上海悦通2025.xls",
};

async function main() {
  console.log("📊 2025 年度余额表核对\n");

  for (const [code, relativePath] of Object.entries(COMPANIES)) {
    const name = CODE_TO_NAME[code] || code;
    const filePath = path.join(SEED_DIR, relativePath);

    if (!fs.existsSync(filePath)) {
      console.log(`  ❌ ${code} ${name}: 文件不存在`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    try {
      const result = await reconcileBalanceSheet(buffer, code, ext);
      const totalDiffs = result.differences.length;

      console.log(`  ${code} ${name}:`);
      console.log(`    Excel ${result.excelRowCount} 行, 系统 ${result.systemAccountCount} 科目`);
      console.log(`    匹配 ${result.matchedCount}, 差异 ${totalDiffs}`);

      if (result.missingInSystem.length > 0) {
        console.log(`    ⚠ Excel有但系统无: ${result.missingInSystem.length} 个科目`);
      }

      if (totalDiffs > 0) {
        // 只显示差额>100的差异
        const bigOnes = result.differences.filter(d => Math.abs(d.diff) > 100);
        if (bigOnes.length > 0) {
          console.log(`    大额差异(>100):`);
          for (const d of bigOnes.slice(0, 20)) {
            console.log(`      ${d.accountCode} ${d.accountName} ${d.field}: Excel=${d.excelValue.toLocaleString()} System=${d.systemValue.toLocaleString()} 差=${d.diff.toLocaleString()}`);
          }
          if (bigOnes.length > 20) console.log(`      ... 还有 ${bigOnes.length - 20} 条`);
        }
      }

      if (totalDiffs === 0) console.log("    ✅ 完全一致");
      console.log();
    } catch (e: any) {
      console.log(`  ❌ ${code} ${name}: ${e.message}\n`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
