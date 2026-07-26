import {
  loadCashFlowConfig,
  loadIncomeStatementConfig,
  type CashFlowLineRow,
  type IncomeStatementLineRow,
} from "../config/load-config-reports";
import { computeIncomeSystemAmounts } from "./income-system-amounts";
import { computeCashFlowSystemAmounts } from "./cash-flow-system-amounts";

export interface DirectReportLine {
  lineCode: string;
  code?: string;
  label: string;
  amount: number;
  currentMonthAmount?: number;
  previousAmount?: number;
  section: string;
  side: "debit" | "credit";
  direction?: "in" | "out" | "net";
  subtract?: boolean;
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
}

export interface DirectReportDiagnostic {
  type: "missingCashFlowAllocations" | "cashFlowReconciliation";
  message: string;
}

export interface DirectStatementReport {
  source: "system" | "empty";
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

export function buildIncomeLines(
  config: IncomeStatementLineRow[],
  amounts: Map<string, number>,
  previousAmounts: Map<string, number>,
  currentMonthAmounts: Map<string, number> = new Map(),
): DirectReportLine[] {
  let accumulated = 0;
  let previousAccumulated = 0;
  let currentMonthAccumulated = 0;
  return config.map((row) => {
    const amount = row.isTotal || row.isGrandTotal
      ? Math.round(accumulated * 100) / 100
      : amounts.get(row.lineCode) ?? 0;
    const previousAmount = row.isTotal || row.isGrandTotal
      ? Math.round(previousAccumulated * 100) / 100
      : previousAmounts.get(row.lineCode) ?? 0;
    const currentMonthAmount = row.isTotal || row.isGrandTotal
      ? Math.round(currentMonthAccumulated * 100) / 100
      : currentMonthAmounts.get(row.lineCode) ?? 0;
    if (!row.isHeader && !row.isTotal && !row.isGrandTotal) {
      accumulated += row.subtract ? -amount : amount;
      previousAccumulated += row.subtract ? -previousAmount : previousAmount;
      currentMonthAccumulated += row.subtract ? -currentMonthAmount : currentMonthAmount;
    }
    return {
      lineCode: row.lineCode,
      code: accountCode(row),
      label: row.label,
      amount,
      currentMonthAmount,
      previousAmount,
      section: row.section,
      side: row.side,
      ...(row.subtract ? { subtract: true as const } : {}),
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
    const [config, previousConfig] = await Promise.all([
      loadIncomeStatementConfig(companyCode, year),
      loadIncomeStatementConfig(companyCode, year - 1),
    ]);
    const [amounts, currentMonthAmounts, previousSystemAmounts] = await Promise.all([
      computeIncomeSystemAmounts(companyCode, year, month, config),
      computeIncomeSystemAmounts(companyCode, year, month, config, "month"),
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
      lines: buildIncomeLines(config, amounts, previousAmounts, currentMonthAmounts),
    };
  }

  const [config, previousConfig] = await Promise.all([
    loadCashFlowConfig(companyCode, year),
    loadCashFlowConfig(companyCode, year - 1),
  ]);
  const [system, currentMonthSystem, previousSystem] = await Promise.all([
    computeCashFlowSystemAmounts(companyCode, year, month, config),
    computeCashFlowSystemAmounts(companyCode, year, month, config, "month"),
    computeCashFlowSystemAmounts(companyCode, year - 1, month, previousConfig),
  ]);
  return {
    source: system.allocationCount > 0 ? "system" : "empty",
    diagnostics: system.allocationCount === 0
        ? [{
          type: "missingCashFlowAllocations" as const,
          message: "来源账套未提供现金流量分配，现金流分类金额暂为空",
        }]
        : [
          ...system.diagnostics,
          ...currentMonthSystem.diagnostics.map((message) => `当月：${message}`),
        ].map((message) => ({
          type: "cashFlowReconciliation" as const,
          message,
        })),
    lines: config.map((row) => ({
      lineCode: row.lineCode,
      code: accountCode(row),
      label: row.label,
      amount: system.amounts.get(row.lineCode) ?? 0,
      currentMonthAmount: currentMonthSystem.amounts.get(row.lineCode) ?? 0,
      previousAmount: previousSystem.amounts.get(row.lineCode) ?? 0,
      section: row.section,
      side: row.side,
      direction: row.direction,
      ...cashFlowFlags(row),
    })),
  };
}
