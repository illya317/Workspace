/**
 * 全公司序时账导入 (2024-2025)，含 03 乱码文件名
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";
import { parseJournal } from "@workspace/finance/server/import/parsers/voucher-parser";
import { confirmFinanceImport } from "@workspace/finance/server/import/import-confirm";
async function getCompanyName(code: string): Promise<string> {
  const c = await prisma.company.findUnique({ where: { code }, select: { name: true } });
  return c?.name ?? code;
}

const ROOT = path.resolve(__dirname, "../..");
const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? path.join(ROOT, "data/dev.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });
const SEED = path.join(ROOT, "prisma/seed-data/财务数据");

const YEARS = [2024, 2025];

const COMPANIES: Record<string, { dir: string; prefix: string }> = {
  "01": { dir: "丰华生物", prefix: "序时账-丰华生物" },
  "02": { dir: "天力通", prefix: "序时账-天力通" },
  "03": { dir: "丰华悦通/序时账", prefix: "" },
  "05": { dir: "加拿大", prefix: "序时账-加拿大" },
  "06": { dir: "上海悦通", prefix: "序时账-上海悦通" },
};

async function main() {
  console.log("📥 重新导入全公司序时账\n");
  for (const [code, cfg] of Object.entries(COMPANIES)) {
    const name = await getCompanyName(code);
    console.log(`${code} ${name}:`);

    for (const year of YEARS) {
      if (cfg.prefix) {
        for (const ext of [".xls", ".xlsx"]) {
          const fp = path.join(SEED, cfg.dir, `${cfg.prefix}${year}${ext}`);
          if (!fs.existsSync(fp)) continue;
          const buf = fs.readFileSync(fp);
          const preview = parseJournal(buf, code, path.extname(fp).toLowerCase() || ".xls");
          if (preview.errors.length > 0) {
            console.log(`  ❌ ${year}: ${preview.errors[0]}`);
            continue;
          }
          const result = await confirmFinanceImport(preview);
          console.log(`  ✓ ${year}: ${result.imported} 凭证`);
          break;
        }
      } else {
        // 乱码文件名
        const dir = path.join(SEED, cfg.dir);
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          if (!f.includes(String(year))) continue;
          const fp = path.join(dir, f);
          const buf = fs.readFileSync(fp);
          const preview = parseJournal(buf, code, path.extname(fp).toLowerCase() || ".xlsx");
          if (preview.errors.length > 0) {
            console.log(`  ❌ ${year}: ${preview.errors[0]}`);
            continue;
          }
          const result = await confirmFinanceImport(preview);
          console.log(`  ✓ ${year}: ${result.imported} 凭证 (${path.basename(f)})`);
        }
      }
    }
  }

  console.log("\n📊 结果:");
  for (const [code] of Object.entries(COMPANIES)) {
    const v = await prisma.financeVoucher.count({ where: { companyCode: code } });
    console.log(`  ${code}: ${v} 凭证`);
  }
  await prisma.$disconnect();
  console.log("✅ 完成");
}

main().catch((e) => { console.error(e); process.exit(1); });
