/**
 * 重新导入 01/02 序时账（清理后重新导入）
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";
import { parseJournal } from "@workspace/finance/server/import/parsers/voucher-parser";
import { confirmFinanceImport } from "@workspace/finance/server/import/import-confirm";

const ROOT = path.resolve(__dirname, "../..");
const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? path.join(ROOT, "data/dev.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });
const SEED = path.join(ROOT, "prisma/seed-data/财务数据");

const FILES: Record<string, string[]> = {
  "01": ["丰华生物/序时账-丰华生物2024.xls", "丰华生物/序时账-丰华生物2025.xls"],
  "02": ["天力通/序时账-天力通2024.xls", "天力通/序时账-天力通2025.xls"],
};

async function main() {
  console.log("📥 重新导入 01/02 序时账\n");
  for (const [code, files] of Object.entries(FILES)) {
    console.log(`${code}:`);
    for (const relPath of files) {
      const filePath = path.join(SEED, relPath);
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase() || ".xls";
      const preview = parseJournal(buffer, code, ext);
      if (preview.errors.length > 0) {
        console.log(`  ❌ ${path.basename(filePath)}: ${preview.errors[0]}`);
        continue;
      }
      const result = await confirmFinanceImport(preview);
      console.log(`  ✓ ${path.basename(filePath)}: ${result.imported} 凭证`);
    }
  }

  const v01 = await prisma.financeVoucher.count({ where: { companyCode: "01" } });
  const v02 = await prisma.financeVoucher.count({ where: { companyCode: "02" } });
  console.log(`\n01: ${v01} 凭证, 02: ${v02} 凭证`);
  await prisma.$disconnect();
  console.log("✅ 完成");
}

main().catch((e) => { console.error(e); process.exit(1); });
