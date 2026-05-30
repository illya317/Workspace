/**
 * 全公司科目表 + 序时账导入 (2024-2025)
 * 用法: npx tsx scripts/import/import-all-accounts-vouchers.ts [--dry-run]
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";
import { parseAccountTable } from "../../server/services/finance/import/parsers/account-parser";
import { parseJournal } from "../../server/services/finance/import/parsers/voucher-parser";
import { confirmFinanceImport } from "../../server/services/finance/import/import-confirm";
import { CODE_TO_NAME } from "../../lib/company";

const ROOT = path.resolve(__dirname, "../..");
const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? path.join(ROOT, "data/dev.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });
const SEED = path.join(ROOT, "prisma/seed-data/财务数据");

const YEARS = [2024, 2025];

const COMPANIES: Record<string, { acctDir: string; acctPrefix: string; voucherDir: string; voucherPattern: string }> = {
  "01": { acctDir: "科目表", acctPrefix: "科目表-丰华生物", voucherDir: "丰华生物", voucherPattern: "序时账-丰华生物" },
  "02": { acctDir: "科目表", acctPrefix: "科目表-上海天力通", voucherDir: "天力通", voucherPattern: "序时账-天力通" },
  "03": { acctDir: "科目表", acctPrefix: "科目表-丰华悦通", voucherDir: "丰华悦通/序时账", voucherPattern: "" }, // garbled names
  "05": { acctDir: "科目表", acctPrefix: "科目表-加拿大", voucherDir: "加拿大", voucherPattern: "序时账-加拿大" },
  "06": { acctDir: "科目表", acctPrefix: "科目表-上海悦通", voucherDir: "上海悦通", voucherPattern: "序时账-上海悦通" },
};

function findGarbledFiles(dir: string, year: number): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.includes(String(year)) && (f.endsWith(".xls") || f.endsWith(".xlsx")))
    .map(f => path.join(dir, f));
}

async function importFile(filePath: string, companyCode: string, type: "account" | "journal", year: number): Promise<number> {
  const name = CODE_TO_NAME[companyCode] || companyCode;
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase() || ".xls";

  let preview;
  if (type === "account") {
    preview = parseAccountTable(buffer, companyCode, ext);
  } else {
    preview = parseJournal(buffer, companyCode, ext);
  }

  if (preview.errors.length > 0) {
    console.log(`    ❌ 解析失败: ${preview.errors[0]}`);
    return 0;
  }

  const result = await confirmFinanceImport(preview);
  const label = type === "account" ? "科目" : "凭证";
  console.log(`    ✓ ${label}: ${result.imported} 条`);
  return result.imported;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "🔍 DRY RUN\n" : "📥 批量导入科目表 + 序时账\n");

  for (const [code, cfg] of Object.entries(COMPANIES)) {
    const name = CODE_TO_NAME[code] || code;
    console.log(`\n${code} ${name}`);

    for (const year of YEARS) {
      // 1. 科目表
      const acctExts = [".xls", ".xlsx"];
      for (const ext of acctExts) {
        const acctPath = path.join(SEED, cfg.acctDir, `${cfg.acctPrefix}${year}${ext}`);
        if (fs.existsSync(acctPath)) {
          console.log(`  📋 科目表 ${year}`);
          if (!dryRun) await importFile(acctPath, code, "account", year);
          break;
        }
      }

      // 2. 序时账
      if (cfg.voucherPattern) {
        for (const ext of [".xls", ".xlsx"]) {
          const vPath = path.join(SEED, cfg.voucherDir, `${cfg.voucherPattern}${year}${ext}`);
          if (fs.existsSync(vPath)) {
            console.log(`  📄 序时账 ${year}`);
            if (!dryRun) await importFile(vPath, code, "journal", year);
            break;
          }
        }
      } else {
        // Garbled filenames (company 03)
        const dir = path.join(SEED, cfg.voucherDir);
        const files = findGarbledFiles(dir, year);
        for (const f of files) {
          console.log(`  📄 序时账 ${year}: ${path.basename(f)}`);
          if (!dryRun) await importFile(f, code, "journal", year);
        }
      }
    }
  }

  // Summary
  console.log("\n📊 导入后统计:");
  for (const [code] of Object.entries(COMPANIES)) {
    const name = CODE_TO_NAME[code] || code;
    const accts = await prisma.financeAccount.count({ where: { companyCode: code } });
    const vouchers = await prisma.financeVoucher.count({ where: { companyCode: code, status: "posted" } });
    console.log(`  ${code} ${name}: ${accts} 科目, ${vouchers} 凭证`);
  }

  await prisma.$disconnect();
  console.log("\n✅ 完成");
}

main().catch((e) => { console.error(e); process.exit(1); });
