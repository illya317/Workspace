/**
 * M2: 确保某公司某年度某报表类型有科目映射
 *
 * 优先级：DB 已有 → 上年度复制 → 根据 FinanceStatementLineConfig.prefixesJson 生成
 */
import { prisma } from "@/lib/prisma";
import { BALANCE_SHEET_LINES } from "../config/balance-sheet-lines";

export async function ensureStatementMappings(
  companyCode: string,
  year: number,
  statementType: string = "balance",
): Promise<{ created: number; source: string }> {
  // 1. Already has mappings?
  const existingCount = await prisma.financeStatementAccountMapping.count({
    where: { companyCode, year, statementType },
  });
  if (existingCount > 0) return { created: 0, source: "existing" };

  // 2. Copy from previous year
  if (year > 2024) {
    const prevMappings = await prisma.financeStatementAccountMapping.findMany({
      where: { companyCode, year: year - 1, statementType },
    });
    if (prevMappings.length > 0) {
      for (const pm of prevMappings) {
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
      }
      return { created: prevMappings.length, source: "copied" };
    }
  }

  // 3. Generate from FinanceStatementLineConfig or TS default
  // First, ensure the line config exists
  // Use BALANCE_SHEET_LINES as default
  let config = await prisma.financeStatementLineConfig.findMany({
    where: { companyCode, year, reportType: "balanceSheet", enabled: true },
  });
  if (config.length === 0) {
    // Seed line config first
    let order = 0;
    for (const line of BALANCE_SHEET_LINES) {
      await prisma.financeStatementLineConfig.upsert({
        where: { companyCode_year_reportType_lineCode: { companyCode, year, reportType: "balanceSheet", lineCode: line.lineCode } },
        create: {
          companyCode, year, reportType: "balanceSheet",
          lineCode: line.lineCode, label: line.label, displayCode: line.displayCode || "",
          section: line.section, side: line.side, sortOrder: order++,
          prefixesJson: JSON.stringify((line as any).prefixes || []),
          subtractPrefixesJson: JSON.stringify((line as any).subtractPrefixes || []),
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

  // Generate mappings from prefixes
  let created = 0;
  for (const line of config) {
    const prefixes = JSON.parse(line.prefixesJson || "[]") as string[];
    const subs = JSON.parse(line.subtractPrefixesJson || "[]") as string[];
    for (const prefix of [...prefixes, ...subs]) {
      if (!prefix) continue;
      await prisma.financeStatementAccountMapping.upsert({
        where: { companyCode_year_statementType_accountCode: { companyCode, year, statementType, accountCode: prefix } },
        create: { companyCode, year, statementType, lineCode: line.lineCode, accountCode: prefix, source: "migrated", note: "从 prefix 迁移" },
        update: {},
      });
      created++;
    }
  }
  return { created, source: "migrated" };
}
