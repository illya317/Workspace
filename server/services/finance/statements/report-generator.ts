import { NextResponse } from "next/server";
import { BalanceItem, ReportPeriod, ReclassEntry } from "./report-helpers";
import { generateBalanceSheet } from "./reports/balance-sheet";
import { generateReviewBasedReport } from "./reports/review-based";

export interface GenerateReportParams {
  period: ReportPeriod;
  balances: BalanceItem[];
  yearBalances: BalanceItem[];
  reportType: "balance" | "income" | "cashflow";
  isCanada: boolean;
  /** Phase 7: approved/adjusted ReclassResult entries with precise amounts */
  reclassEntries?: ReclassEntry[];
}

export async function generateReport(params: GenerateReportParams) {
  const { period, balances, reportType, reclassEntries } = params;

  // balance sheet: mapping-based (unchanged)
  if (reportType === "balance") return generateBalanceSheet(period, balances, reclassEntries);

  // income statement / cash flow: review-based (P3 Batch 7)
  const reviewReport = await generateReviewBasedReport(
    period.companyCode ?? "",
    period.year,
    period.month,
    reportType === "income" ? "incomeStatement" : "cashFlow",
  );

  return NextResponse.json({
    type: reportType,
    period: { id: period.id, year: period.year, month: period.month, companyCode: period.companyCode },
    source: reviewReport.source,
    diagnostics: reviewReport.diagnostics,
    lines: reviewReport.lines,
  });
}
