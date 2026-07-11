/**
 * 导入 2024 年度余额表作为所有公司的 active baseline snapshot。
 *
 * 用法: npx tsx scripts/import/import-2024-baselines.ts [--dry-run]
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";
import { parseBalanceSheet } from "@workspace/finance/server/import/parsers/balance-parser";
import { createSnapshotFromPreview } from "@workspace/finance/server/ledger/annual-balances";

const ROOT = path.resolve(__dirname, "../..");
const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? path.join(ROOT, "data/dev.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

const SEED_DIR = path.resolve(__dirname, "../../prisma/seed-data/财务数据");

// 公司编码 → 余额表文件路径（相对于 SEED_DIR）
const COMPANY_BALANCE_SHEETS: Record<string, string> = {
  "01": "丰华生物/余额表-丰华生物2024.xls",
  "02": "天力通/余额表-天力通2024.xls",
  "03": "丰华悦通/丰华悦通/余额表-丰华悦通 2024.xlsx",
  // 04 丰华制药/GMP: 暂无 2024 年度余额表
  "05": "加拿大/余额表-加拿大2024.xls",
  "06": "上海悦通/余额表-上海悦通2024.xls",
};

async function upsertAccounts(accounts: { code: string; name: string; parentCode: string | null; category: string; balanceDirection: string }[], companyCode: string, year: number) {
  const accountCodeToId = new Map<string, number>();
  const sorted = [...accounts].sort((a, b) => a.code.length - b.code.length);

  for (const account of sorted) {
    const parentId = account.parentCode ? accountCodeToId.get(account.parentCode) ?? null : null;
    const existing = await prisma.financeAccount.findFirst({
      where: { code: account.code, companyCode, year },
    });

    const data = {
      name: account.name,
      category: account.category,
      balanceDirection: account.balanceDirection,
      parentId,
      companyCode,
      year,
    };

    if (existing) {
      await prisma.financeAccount.update({ where: { id: existing.id }, data });
      accountCodeToId.set(account.code, existing.id);
    } else {
      const created = await prisma.financeAccount.create({
        data: { code: account.code, ...data, sortOrder: 0, isActive: true },
      });
      accountCodeToId.set(account.code, created.id);
    }
  }

  return accountCodeToId;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "🔍 DRY RUN\n" : "📥 开始导入 2024 年度余额表...\n");

  for (const [companyCode, relativePath] of Object.entries(COMPANY_BALANCE_SHEETS)) {
    const fullPath = path.join(SEED_DIR, relativePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`  ⚠  ${companyCode}: 文件不存在 ${fullPath}，跳过`);
      continue;
    }

    const fileExt = path.extname(fullPath).toLowerCase();
    const buffer = fs.readFileSync(fullPath);
    const preview = parseBalanceSheet(buffer, companyCode, fileExt);

    if (preview.errors.length > 0) {
      console.error(`  ❌ ${companyCode}: 解析错误 — ${preview.errors.join("; ")}`);
      continue;
    }

    console.log(`  ${companyCode}: ${preview.accounts.length} 个科目, ${preview.balances?.length || 0} 行余额, year=${preview.year}`);

    if (dryRun) {
      console.log(`    [DRY] 会创建 ${preview.balances?.length || 0} 条 snapshot row`);
      continue;
    }

    // 1. Upsert 科目
    const accountCodeToId = await upsertAccounts(preview.accounts, companyCode, preview.year);
    console.log(`    ✓ 科目同步完成`);

    // 2. 创建 Snapshot
    const imported = await createSnapshotFromPreview(preview, accountCodeToId);
    console.log(`    ✓ Snapshot 创建完成: ${imported} 行`);
  }

  // 检查缺失的公司
  const missing = Object.keys(COMPANY_BALANCE_SHEETS).length < 5 ? ["04"] : [];
  if (missing.length > 0) {
    console.log(`\n⚠ 以下公司缺少 2024 年度余额表文件: ${missing.join(", ")}`);
  }

  // 验证
  if (!dryRun) {
    console.log("\n📊 验证:");
    const snapshots = await prisma.financeBalanceSnapshot.findMany({
      where: { year: 2024, snapshotType: "baseline" },
      include: { _count: { select: { rows: true } } },
    });
    for (const snap of snapshots) {
      console.log(`  ${snap.companyCode} (${snap.snapshotType}): ${snap._count.rows} rows, active=${snap.isActive}`);
    }
  }

  await prisma.$disconnect();
  console.log("\n✅ 完成");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
