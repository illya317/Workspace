/**
 * 报表项目配置加载器
 * 优先级：DB 配置 → 上一年度复制 → TS 默认模板
 */
import { prisma } from "@/lib/prisma";
import { BALANCE_SHEET_LINES } from "../config/balance-sheet-lines";
import type { BalanceSheetLineConfig } from "../config/balance-sheet-lines";

export async function loadBalanceSheetConfig(
  companyCode: string,
  year: number,
): Promise<BalanceSheetLineConfig[]> {
  // 1. Try DB config
  const dbLines = await prisma.financeStatementLineConfig.findMany({
    where: { companyCode, year, reportType: "balanceSheet", enabled: true },
    orderBy: { sortOrder: "asc" },
  });

  if (dbLines.length > 0) {
    return dbLines.map(toLineConfig);
  }

  // 2. Inherit from previous year
  if (year > 2024) {
    const prevLines = await prisma.financeStatementLineConfig.findMany({
      where: { companyCode, year: year - 1, reportType: "balanceSheet", enabled: true },
      orderBy: { sortOrder: "asc" },
    });
    if (prevLines.length > 0) {
      // Copy to current year
      for (const pl of prevLines) {
        await prisma.financeStatementLineConfig.upsert({
          where: { companyCode_year_reportType_lineCode: { companyCode, year, reportType: "balanceSheet", lineCode: pl.lineCode } },
          create: { companyCode, year, reportType: "balanceSheet", lineCode: pl.lineCode, label: pl.label, section: pl.section, side: pl.side, sortOrder: pl.sortOrder, prefixesJson: pl.prefixesJson, formulaJson: pl.formulaJson, reclassSource: pl.reclassSource, reclassTarget: pl.reclassTarget, isHeader: pl.isHeader, isTotal: pl.isTotal, isGrandTotal: pl.isGrandTotal },
          update: {},
        });
      }
      const copied = await prisma.financeStatementLineConfig.findMany({
        where: { companyCode, year, reportType: "balanceSheet", enabled: true },
        orderBy: { sortOrder: "asc" },
      });
      return copied.map(toLineConfig);
    }
  }

  // 3. Seed from TS default
  let order = 0;
  for (const line of BALANCE_SHEET_LINES) {
    await prisma.financeStatementLineConfig.upsert({
      where: { companyCode_year_reportType_lineCode: { companyCode, year, reportType: "balanceSheet", lineCode: line.lineCode } },
      create: {
        companyCode, year, reportType: "balanceSheet",
        lineCode: line.lineCode, label: line.label, section: line.section,
        side: line.side, sortOrder: order++,
        prefixesJson: JSON.stringify((line as any).prefixes || []),
        reclassSource: line.reclassSource || false,
        reclassTarget: line.reclassTarget || false,
        isHeader: line.isHeader || false,
        isTotal: line.isTotal || false,
        isGrandTotal: line.isGrandTotal || false,
      },
      update: {},
    });
  }
  const seeded = await prisma.financeStatementLineConfig.findMany({
    where: { companyCode, year, reportType: "balanceSheet", enabled: true },
    orderBy: { sortOrder: "asc" },
  });
  return seeded.map(toLineConfig);
}

function toLineConfig(db: any): BalanceSheetLineConfig {
  return {
    lineCode: db.lineCode,
    label: db.label,
    section: db.section as any,
    side: db.side as any,
    isHeader: db.isHeader,
    isTotal: db.isTotal,
    isGrandTotal: db.isGrandTotal,
    reclassSource: db.reclassSource,
    reclassTarget: db.reclassTarget,
    prefixes: JSON.parse(db.prefixesJson || "[]"),
    displayCode: "",
  };
}
