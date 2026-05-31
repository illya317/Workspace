import { BalanceItem, ReportPeriod, ReclassEntry } from "./report-helpers";
import { generateBalanceSheet } from "./reports/balance-sheet";
import { generateIncomeStatement } from "./reports/income-statement";
import { generateCashFlow } from "./reports/cash-flow";

export interface GenerateReportParams {
  period: ReportPeriod;
  balances: BalanceItem[];
  yearBalances: BalanceItem[];
  reportType: "balance" | "income" | "cashflow";
  isCanada: boolean;
  /** Phase 7: approved/adjusted ReclassResult entries with precise amounts */
  reclassEntries?: ReclassEntry[];
}

export function generateReport(params: GenerateReportParams) {
  const { period, balances, yearBalances, reportType, isCanada, reclassEntries } = params;
  if (reportType === "balance") return generateBalanceSheet(period, balances, reclassEntries);
  if (reportType === "income") return generateIncomeStatement(period, yearBalances, isCanada);
  return generateCashFlow(period, balances);
}
