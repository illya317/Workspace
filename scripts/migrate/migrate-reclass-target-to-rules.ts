/**
 * 迁移脚本：FinanceAccount.reclassTargetCode → FinanceReclassRule
 *
 * 从现有科目的 reclassTargetCode 创建独立规则表记录。
 * 规则唯一键: (companyCode, year, sourceAccountCode, abnormalSide)
 * abnormalSide 由 balanceDirection 派生（反方向即为异常方向）。
 *
 * 用法: npx tsx scripts/migrate/migrate-reclass-target-to-rules.ts [--dry-run]
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";
import "dotenv/config";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "../../prisma/dev.db";
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

function deriveAbnormalSide(balanceDirection: string): string {
  return balanceDirection === "debit" ? "credit" : "debit";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "🔍 DRY RUN — 不会真正写入" : "⚠️  执行迁移...");

  // 1. 读取所有有 reclassTargetCode 的科目
  const accounts = await prisma.financeAccount.findMany({
    where: { reclassTargetCode: { not: null } },
    select: {
      code: true,
      companyCode: true,
      year: true,
      balanceDirection: true,
      reclassTargetCode: true,
    },
    orderBy: [{ companyCode: "asc" }, { year: "asc" }, { code: "asc" }],
  });

  console.log(`📊 旧表扫描: ${accounts.length} 个科目有 reclassTargetCode`);

  if (accounts.length === 0) {
    console.log("无需迁移。");
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let skipped = 0;
  let skippedNullYear = 0;
  let skippedNoCompany = 0;
  const errors: string[] = [];

  for (const acc of accounts) {
    // year 为空则跳过
    if (acc.year === null) {
      console.log(`  ⚠️  跳过: ${acc.code} (companyCode=${acc.companyCode}) — year=null`);
      skippedNullYear++;
      continue;
    }

    const abnormalSide = deriveAbnormalSide(acc.balanceDirection);
    const targetCode = acc.reclassTargetCode!;

    // companyCode 非空约束：旧科目若无 companyCode 则跳过
    if (!acc.companyCode) {
      console.log(`  ⚠️  跳过: ${acc.code} (year=${acc.year}) — companyCode=null，规则表要求 companyCode 非空`);
      skippedNoCompany++;
      continue;
    }

    const existing = await prisma.financeReclassRule.findFirst({
      where: {
        companyCode: acc.companyCode,
        year: acc.year,
        sourceAccountCode: acc.code,
        abnormalSide,
      },
    });

    if (existing) {
      // 已有规则无条件跳过：新表是人工确认后的权威来源，旧字段不再覆盖
      skipped++;
      continue;
    }

    // 新建
    if (dryRun) {
      console.log(`  [DRY] Create: ${acc.companyCode ?? "(通用)"} ${acc.year} ${acc.code} abnormal=${abnormalSide} → ${targetCode}`);
    } else {
      await prisma.financeReclassRule.create({
        data: {
          companyCode: acc.companyCode,
          year: acc.year,
          sourceAccountCode: acc.code,
          abnormalSide,
          targetAccountCode: targetCode,
          source: "manual",
          enabled: true,
        },
      });
    }
    created++;
  }

  // 2. 汇总
  console.log("");
  console.log(dryRun ? "🔍 DRY RUN 汇总：" : "✅ 迁移完成：");
  console.log(`   新建规则: ${created}`);
  console.log(`   跳过(已存在): ${skipped}`);
  if (skippedNullYear > 0) console.log(`   跳过(year=null): ${skippedNullYear}`);
  if (skippedNoCompany > 0) console.log(`   跳过(companyCode=null): ${skippedNoCompany}`);
  if (errors.length > 0) {
    console.log(`   ⚠️  错误: ${errors.length}`);
    for (const e of errors) console.log(`      ${e}`);
  }

  // 3. 验证无重复（仅非 dry-run）
  if (!dryRun) {
    const distinctCheck = await prisma.financeReclassRule.groupBy({
      by: ["companyCode", "year", "sourceAccountCode", "abnormalSide"],
      having: { id: { _count: { gt: 1 } } },
    });
    if (distinctCheck.length > 0) {
      console.error("❌ 发现重复规则！");
      for (const d of distinctCheck) {
        console.error(`  ${d.companyCode ?? "(null)"} / ${d.year} / ${d.sourceAccountCode} / ${d.abnormalSide}`);
      }
    } else {
      console.log("✅ 无重复规则");
    }
    const total = await prisma.financeReclassRule.count();
    console.log(`📊 规则表总数: ${total}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("迁移失败:", e);
  process.exit(1);
});
