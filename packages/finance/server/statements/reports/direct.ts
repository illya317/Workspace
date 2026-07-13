import { prisma } from "@workspace/platform/server/prisma";
import {
  loadCashFlowConfig,
  loadIncomeStatementConfig,
  type CashFlowLineRow,
  type IncomeStatementLineRow,
} from "../config/load-config-reports";
import { computeIncomeSystemAmounts } from "./income-system-amounts";

export interface DirectReportLine {
  code?: string;
  label: string;
  amount: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
}

export interface DirectReportDiagnostic {
  type: "missingWorkpaper";
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
    ...(row.isTotal ? { isTotal: true as const } : {}),
    ...(row.isGrandTotal ? { isGrandTotal: true as const } : {}),
  };
}

function buildIncomeLines(
  config: IncomeStatementLineRow[],
  amounts: Map<string, number>,
): DirectReportLine[] {
  let accumulated = 0;
  return config.map((row) => {
    const amount = row.isTotal || row.isGrandTotal
      ? Math.round(accumulated * 100) / 100
      : amounts.get(row.lineCode) ?? 0;
    if (!row.isTotal && !row.isGrandTotal) accumulated += amount;
    return {
      code: accountCode(row),
      label: row.label,
      amount,
      ...incomeFlags(row),
    };
  });
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
    const config = await loadIncomeStatementConfig(companyCode, year);
    const amounts = await computeIncomeSystemAmounts(companyCode, year, month, config);
    return {
      source: "system",
      diagnostics: [],
      lines: buildIncomeLines(config, amounts),
    };
  }

  const [config, workpaper] = await Promise.all([
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
  ]);
  const amounts = new Map(
    workpaper?.lines.map((line) => [
      line.lineCode,
      line.manualAmount + line.importedAmount,
    ]) ?? [],
  );
  return {
    source: workpaper ? "workpaper" : "empty",
    diagnostics: workpaper
      ? []
      : [{ type: "missingWorkpaper", message: "当前期间没有现金流量表底稿数据" }],
    lines: config.map((row) => ({
      code: accountCode(row),
      label: row.label,
      amount: amounts.get(row.lineCode) ?? 0,
      ...cashFlowFlags(row),
    })),
  };
}
