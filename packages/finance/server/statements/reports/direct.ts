import { prisma } from "@workspace/platform/server/prisma";
import {
  loadCashFlowConfig,
  loadIncomeStatementConfig,
  type CashFlowLineRow,
  type IncomeStatementLineRow,
} from "../config/load-config-reports";
import { computeIncomeSystemAmounts } from "./income-system-amounts";
import { computeCashFlowSystemAmounts } from "./cash-flow-system-amounts";

export interface DirectReportLine {
  code?: string;
  label: string;
  amount: number;
  previousAmount?: number;
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
}

export interface DirectReportDiagnostic {
  type: "missingWorkpaper" | "cashFlowReconciliation";
  message: string;
}

export interface DirectStatementReport {
  source: "system" | "workpaper" | "empty";
  diagnostics: DirectReportDiagnostic[];
  lines: DirectReportLine[];
}

function accountCode(row: IncomeStatementLineRow | CashFlowLineRow) {
  return row.prefixes.length > 0 ? row.prefixes.join("+") : undefined;
}

function incomeFlags(row: IncomeStatementLineRow) {
  return {
    ...(row.isHeader ? { isHeader: true as const } : {}),
    ...(row.isTotal ? { isTotal: true as const } : {}),
    ...(row.isGrandTotal ? { isGrandTotal: true as const } : {}),
  };
}

function buildIncomeLines(
  config: IncomeStatementLineRow[],
  amounts: Map<string, number>,
  previousAmounts: Map<string, number>,
): DirectReportLine[] {
  let accumulated = 0;
  let previousAccumulated = 0;
  return config.map((row) => {
    const amount = row.isTotal || row.isGrandTotal
      ? Math.round(accumulated * 100) / 100
      : amounts.get(row.lineCode) ?? 0;
    const previousAmount = row.isTotal || row.isGrandTotal
      ? Math.round(previousAccumulated * 100) / 100
      : previousAmounts.get(row.lineCode) ?? 0;
    if (!row.isHeader && !row.isTotal && !row.isGrandTotal) {
      accumulated += row.subtract ? -amount : amount;
      previousAccumulated += row.subtract ? -previousAmount : previousAmount;
    }
    return {
      code: accountCode(row),
      label: row.label,
      amount,
      previousAmount,
      ...incomeFlags(row),
    };
  });
}

function workpaperAmountMap(
  workpaper: { lines: { lineCode: string; manualAmount: number; importedAmount: number }[] } | null,
) {
  return new Map(workpaper?.lines.map((line) => [
    line.lineCode,
    line.manualAmount + line.importedAmount,
  ]) ?? []);
}

function workpaperLines(
  config: (IncomeStatementLineRow | CashFlowLineRow)[],
  current: Map<string, number>,
  previous: Map<string, number>,
): DirectReportLine[] {
  return config.map((row) => ({
    code: accountCode(row),
    label: row.label,
    amount: current.get(row.lineCode) ?? 0,
    previousAmount: previous.get(row.lineCode) ?? 0,
    ...("isHeader" in row && row.isHeader ? { isHeader: true as const } : {}),
    ...(("isTotal" in row && row.isTotal) || ("isSubtotal" in row && row.isSubtotal) ? { isTotal: true as const } : {}),
    ...(row.isGrandTotal ? { isGrandTotal: true as const } : {}),
  }));
}

function cashFlowFlags(row: CashFlowLineRow) {
  return {
    ...(row.isSubtotal ? { isTotal: true as const } : {}),
    ...(row.isGrandTotal ? { isGrandTotal: true as const } : {}),
  };
}

export async function generateDirectStatementReport(
  companyCode: string,
  year: number,
  month: number,
  reportType: "incomeStatement" | "cashFlow",
): Promise<DirectStatementReport> {
  if (reportType === "incomeStatement") {
    const [config, previousConfig, workpaper, previousWorkpaper] = await Promise.all([
      loadIncomeStatementConfig(companyCode, year),
      loadIncomeStatementConfig(companyCode, year - 1),
      prisma.financeStatementWorkpaper.findUnique({
        where: { companyCode_year_month_reportType: { companyCode, year, month, reportType } },
        include: { lines: true },
      }),
      prisma.financeStatementWorkpaper.findUnique({
        where: { companyCode_year_month_reportType: { companyCode, year: year - 1, month, reportType } },
        include: { lines: true },
      }),
    ]);
    if (workpaper) {
      return {
        source: "workpaper",
        diagnostics: [],
        lines: workpaperLines(config, workpaperAmountMap(workpaper), workpaperAmountMap(previousWorkpaper)),
      };
    }
    const [amounts, previousSystemAmounts] = await Promise.all([
      computeIncomeSystemAmounts(companyCode, year, month, config),
      computeIncomeSystemAmounts(companyCode, year - 1, month, previousConfig),
    ]);
    const previousAmounts = new Map<string, number>();
    for (const line of buildIncomeLines(previousConfig, previousSystemAmounts, new Map())) {
      const lineCode = previousConfig.find((row) => row.label === line.label)?.lineCode;
      if (lineCode) previousAmounts.set(lineCode, line.amount);
    }
    return {
      source: "system",
      diagnostics: [],
      lines: buildIncomeLines(config, amounts, previousAmounts),
    };
  }

  const [config, workpaper, previousWorkpaper] = await Promise.all([
    loadCashFlowConfig(companyCode, year),
    prisma.financeStatementWorkpaper.findUnique({
      where: {
        companyCode_year_month_reportType: {
          companyCode,
          year,
          month,
          reportType,
        },
      },
      include: { lines: true },
    }),
    prisma.financeStatementWorkpaper.findUnique({
      where: {
        companyCode_year_month_reportType: {
          companyCode,
          year: year - 1,
          month,
          reportType,
        },
      },
      include: { lines: true },
    }),
  ]);
  const system = workpaper ? null : await computeCashFlowSystemAmounts(companyCode, year, month, config);
  const amounts = workpaper ? workpaperAmountMap(workpaper) : system!.amounts;
  const previousAmounts = workpaperAmountMap(previousWorkpaper);
  return {
    source: workpaper ? "workpaper" : system!.allocationCount > 0 ? "system" : "empty",
    diagnostics: workpaper
      ? []
      : system!.allocationCount === 0
        ? [{
          type: "missingWorkpaper" as const,
          message: "来源账套未提供现金流量分配，现金流分类金额暂为空",
        }]
        : system!.diagnostics.map((message) => ({
          type: "cashFlowReconciliation" as const,
          message,
        })),
    lines: config.map((row) => ({
      code: accountCode(row),
      label: row.label,
      amount: amounts.get(row.lineCode) ?? 0,
      previousAmount: previousAmounts.get(row.lineCode) ?? 0,
      ...cashFlowFlags(row),
    })),
  };
}
