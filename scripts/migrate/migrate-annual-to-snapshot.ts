/**
 * 迁移脚本：FinanceAnnualBalance → FinanceBalanceSnapshot + FinanceBalanceSnapshotRow
 *
 * 按 (companyCode, year, sourceFile) 分组创建批次 + 明细。
 * 旧表数据保留不删，确认迁移正确后再手动删除旧 model。
 *
 * 用法: npx tsx scripts/migrate/migrate-annual-to-snapshot.ts [--dry-run]
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "../../prisma/dev.db";
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

const BASELINE_YEAR = 2024;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "🔍 DRY RUN — 不会真正写入" : "⚠️  执行迁移...");

  // 1. 读取全部旧数据
  const oldRows = await prisma.financeAnnualBalance.findMany({
    include: { account: true },
    orderBy: [{ companyCode: "asc" }, { year: "asc" }, { id: "asc" }],
  });

  if (oldRows.length === 0) {
    console.log("没有 FinanceAnnualBalance 数据需要迁移。");
    await prisma.$disconnect();
    return;
  }

  console.log(`📊 旧表行数: ${oldRows.length}`);

  // 2. 按 (companyCode, year, sourceFile) 分组
  const batchMap = new Map<string, { companyCode: string; year: number; sourceFile: string; rows: typeof oldRows }>();

  for (const row of oldRows) {
    const sf = row.sourceFile || "";
    const batchKey = `${row.companyCode}::${row.year}::${sf ?? "__NULL__"}`;
    if (!batchMap.has(batchKey)) {
      batchMap.set(batchKey, {
        companyCode: row.companyCode,
        year: row.year,
        sourceFile: sf,
        rows: [],
      });
    }
    batchMap.get(batchKey)!.rows.push(row);
  }

  console.log(`📦 分组数: ${batchMap.size}`);

  // 3. 检查新旧表是否已有数据（幂等）
  const existingSnapshots = await prisma.financeBalanceSnapshot.count();
  if (existingSnapshots > 0) {
    console.log(`⚠️  新表已有 ${existingSnapshots} 条 Snapshot，遇到已存在批次会跳过。`);
  }

  let totalSnapshots = 0;
  let totalRows = 0;
  const batches = Array.from(batchMap.values());

  for (const batch of batches) {
    const { companyCode, year, sourceFile } = batch;
    const snapshotType = year === BASELINE_YEAR ? "baseline" : "reconcile";

    // 幂等检查
    const existing = await prisma.financeBalanceSnapshot.findUnique({
      where: { companyCode_year_snapshotType_sourceFile: { companyCode, year, snapshotType, sourceFile } },
    });
    if (existing) {
      console.log(`  ⏭ 跳过已存在: ${companyCode} ${year} "${sourceFile ?? ""}" (type=${snapshotType})`);
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY] Snapshot: ${companyCode} ${year} type=${snapshotType} file="${sourceFile ?? ""}" rows=${batch.rows.length}`);
      totalSnapshots++;
      totalRows += batch.rows.length;
      continue;
    }

    // 创建 Snapshot 批次
    const importedAt = batch.rows[0]?.importedAt ?? new Date();
    const snapshot = await prisma.financeBalanceSnapshot.create({
      data: {
        companyCode,
        year,
        snapshotType,
        isActive: year === BASELINE_YEAR,
        sourceFile,
        rowCount: batch.rows.length,
        importedAt,
        note: `Migration from FinanceAnnualBalance — ${year} ${snapshotType === "baseline" ? "基准" : "校准"}`,
      },
    });

    // 创建 SnapshotRow 明细
    for (const old of batch.rows) {
      await prisma.financeBalanceSnapshotRow.create({
        data: {
          snapshotId: snapshot.id,
          accountId: old.accountId,
          accountCode: old.account.code,
          accountName: old.account.name,
          openingDebit: old.openingDebit,
          openingCredit: old.openingCredit,
          currentDebit: old.currentDebit,
          currentCredit: old.currentCredit,
          closingDebit: old.closingDebit,
          closingCredit: old.closingCredit,
        },
      });
    }

    console.log(`  ✓ ${companyCode} ${year} type=${snapshotType}: ${batch.rows.length} rows`);
    totalSnapshots++;
    totalRows += batch.rows.length;
  }

  console.log(`\n📊 迁移结果: ${totalSnapshots} 批次, ${totalRows} 明细行`);

  // 4. 校验
  if (!dryRun) {
    const newRowCount = await prisma.financeBalanceSnapshotRow.count();
    console.log(`\n校验: 旧表行数=${oldRows.length}  新表明细行数=${newRowCount}`);

    // 按 (companyCode, year) 校验 closing 合计
    const oldClosing = new Map<string, number>();
    for (const row of oldRows) {
      const key = `${row.companyCode}::${row.year}`;
      oldClosing.set(key, (oldClosing.get(key) || 0) + row.closingDebit + row.closingCredit);
    }

    const snapshots = await prisma.financeBalanceSnapshot.findMany({ include: { rows: true } });
    const newClosing = new Map<string, number>();
    for (const snap of snapshots) {
      const key = `${snap.companyCode}::${snap.year}`;
      const total = snap.rows.reduce((sum, r) => sum + r.closingDebit + r.closingCredit, 0);
      newClosing.set(key, (newClosing.get(key) || 0) + total);
    }

    let mismatch = false;
    const oldKeys = Array.from(oldClosing.keys());
    for (const key of oldKeys) {
      const oldVal = oldClosing.get(key) || 0;
      const newVal = newClosing.get(key) || 0;
      const diff = Math.abs(oldVal - newVal);
      if (diff > 0.01) {
        console.error(`❌ ${key} closing合计: 旧=${oldVal.toFixed(2)} 新=${newVal.toFixed(2)} diff=${diff.toFixed(2)}`);
        mismatch = true;
      } else {
        console.log(`✓ ${key} closing合计一致: ${oldVal.toFixed(2)}`);
      }
    }

    if (mismatch) {
      console.error("\n⚠️  校验不通过！");
    } else {
      console.log("\n✅ 全部校验通过");
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
