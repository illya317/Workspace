/**
 * M2: 确保某公司某年度某报表类型有科目映射
 *
 * M11.6: 改为 additive 补缺模式。任何"已有 mapping"都不再直接整年跳过，
 * 只跳过 accountCode 维度——即"已存在的 accountCode 不覆盖"（无论 source
 * 是 manual / copied / migrated / default），缺失的 accountCode 仍按
 * line config 的 prefixesJson + subtractPrefixesJson 补齐，source
 * 记 "migrated"，note 区分 prefix / subtractPrefix。
 *
 * M11.6 P1 fix: 复制上一年后**不直接 return**，继续跑 backfill pass。
 * 否则当年 line config 新增的 prefix、或上一年本身就缺的 subtractPrefix，
 * 会跨年漏到新年。
 *
 * 整体流程：
 *  1. 加载（必要时初始化）line config
 *  2. 加载当前年度已有 mappings（accountCode → 已有记录）
 *  3. 若当前年度完全为空 + 上一年有 mapping → 复制上一年（保留原行为）
 *  4. 无论之前是否复制，按 line config 跑一次 migrate pass：
 *     - 对 prefixes + subtractPrefixes 中每个 accountCode
 *     - 若 existingByCode 中没有 → upsert (create with source="migrated")
 *     - 若已存在 → 跳过（manual 保护 + 不覆盖迁移来源）
 *  5. 返回 created 数（copied + backfilled 之和）+ source 标签
 *     - "copied_backfilled"   复制后又有 backfill
 *     - "copied"              只复制
 *     - "migrated"            从 line config 全新创建（之前 0 条）
 *     - "backfilled"          在已有 mapping 上补齐缺失
 *     - "existing"            啥也没改
 */
import { prisma } from "@workspace/platform/server/prisma";
import { BALANCE_SHEET_LINES } from "../config/balance-sheet-lines";

export async function ensureStatementMappings(
  companyCode: string,
  year: number,
  statementType: string = "balance",
): Promise<{ created: number; source: string }> {
  // 1. Ensure line config exists (DB or seeded from TS default)
  let config = await prisma.financeStatementLineConfig.findMany({
    where: { companyCode, year, reportType: "balanceSheet", enabled: true },
  });
  if (config.length === 0) {
    let order = 0;
    for (const line of BALANCE_SHEET_LINES) {
      await prisma.financeStatementLineConfig.upsert({
        where: { companyCode_year_reportType_lineCode: { companyCode, year, reportType: "balanceSheet", lineCode: line.lineCode } },
        create: {
          companyCode, year, reportType: "balanceSheet",
          lineCode: line.lineCode, label: line.label, displayCode: line.displayCode || "",
          section: line.section, side: line.side, sortOrder: order++,
          prefixesJson: JSON.stringify(line.prefixes || []),
          subtractPrefixesJson: JSON.stringify(line.subtractPrefixes || []),
          reclassSource: line.reclassSource || false, reclassTarget: line.reclassTarget || false,
          isHeader: line.isHeader || false, isTotal: line.isTotal || false, isGrandTotal: line.isGrandTotal || false,
        },
        update: {},
      });
    }
    config = await prisma.financeStatementLineConfig.findMany({
      where: { companyCode, year, reportType: "balanceSheet", enabled: true },
    });
  }

  // 2. Load existing mappings for this (company, year, statementType)
  const existing = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode, year, statementType },
    select: { accountCode: true, lineCode: true, source: true },
  });
  const existingByCode = new Map<string, { lineCode: string; source: string }>();
  for (const m of existing) existingByCode.set(m.accountCode, { lineCode: m.lineCode, source: m.source });
  const initiallyHadAny = existing.length > 0;

  // 3. If empty + prev year has mappings → copy (does NOT return; backfill still runs)
  let copied = 0;
  if (existing.length === 0 && year > 2024) {
    const prevMappings = await prisma.financeStatementAccountMapping.findMany({
      where: { companyCode, year: year - 1, statementType },
    });
    for (const pm of prevMappings) {
      if (existingByCode.has(pm.accountCode)) continue;
      await prisma.financeStatementAccountMapping.upsert({
        where: { companyCode_year_statementType_accountCode: { companyCode, year, statementType, accountCode: pm.accountCode } },
        create: {
          companyCode, year, statementType,
          lineCode: pm.lineCode, accountCode: pm.accountCode,
          includeChildren: pm.includeChildren,
          source: "copied",
          note: `从 ${year - 1} 年度复制`,
        },
        update: {},
      });
      existingByCode.set(pm.accountCode, { lineCode: pm.lineCode, source: "copied" });
      copied++;
    }
  }

  // 4. Migrate / backfill pass: add missing accountCodes from line config.
  //    Skips any accountCode that already has a mapping (manual-safe + no-clobber).
  //    Always runs, regardless of whether step 3 happened.
  let backfilled = 0;
  for (const line of config) {
    const prefixes = JSON.parse(line.prefixesJson || "[]") as string[];
    const subs = JSON.parse(line.subtractPrefixesJson || "[]") as string[];
    for (const prefix of [...prefixes, ...subs]) {
      if (!prefix || existingByCode.has(prefix)) continue;
      const kind = subs.includes(prefix) ? "subtractPrefix" : "prefix";
      await prisma.financeStatementAccountMapping.upsert({
        where: { companyCode_year_statementType_accountCode: { companyCode, year, statementType, accountCode: prefix } },
        create: {
          companyCode, year, statementType,
          lineCode: line.lineCode, accountCode: prefix,
          source: "migrated",
          note: kind === "subtractPrefix" ? "补齐 subtractPrefix" : "补齐 prefix",
        },
        update: {},
      });
      existingByCode.set(prefix, { lineCode: line.lineCode, source: "migrated" });
      backfilled++;
    }
  }

  // 5. Compute source label
  const total = copied + backfilled;
  let source: string;
  if (copied > 0 && backfilled > 0) source = "copied_backfilled";
  else if (copied > 0) source = "copied";
  else if (backfilled > 0) source = initiallyHadAny ? "backfilled" : "migrated";
  else source = "existing";
  return { created: total, source };
}
