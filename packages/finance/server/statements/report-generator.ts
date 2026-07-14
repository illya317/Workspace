import { NextResponse } from "next/server";
import { prisma } from "@workspace/platform/server/prisma";
import { BalanceItem, ReportPeriod, ReclassEntry } from "./report-helpers";
import { generateBalanceSheet } from "./reports/balance-sheet";
import { generateDirectStatementReport } from "./reports/direct";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export interface GenerateReportParams {
  period: ReportPeriod;
  balances: BalanceItem[];
  yearBalances: BalanceItem[];
  reportType: "balance" | "income" | "cashflow";
  isCanada: boolean;
  /** Approved balance-reclassification entries with precise amounts. */
  reclassEntries?: ReclassEntry[];
}

export interface GenerateFinanceReportInput {
  periodId?: number;
  companyCode?: string;
  year?: number;
  month?: number;
  reportType: "balance" | "income" | "cashflow";
}

export async function generateFinanceReport(input: GenerateFinanceReportInput) {
  let targetPeriodId = input.periodId;
  if (!targetPeriodId && input.companyCode && input.year !== undefined && input.month !== undefined) {
    const period = await prisma.financePeriod.findFirst({
      where: { companyCode: input.companyCode, year: input.year, month: input.month },
    });
    if (!period) return jsonErrorResponse("期间不存在", 404);
    targetPeriodId = period.id;
  }
  if (!targetPeriodId) {
    return jsonErrorResponse("periodId 或 companyCode+year+month 为必填", 400);
  }

  const period = await prisma.financePeriod.findUnique({ where: { id: targetPeriodId } });
  if (!period) return jsonErrorResponse("期间不存在", 404);

  if (input.reportType === "income" || input.reportType === "cashflow") {
    return generateReport({
      period,
      balances: [],
      yearBalances: [],
      reportType: input.reportType,
      isCanada: period.companyCode === "04",
    });
  }

  const [balances, yearBalances, balanceRows] = await Promise.all([
    prisma.financeAccountBalance.findMany({
      where: { periodId: targetPeriodId },
      include: { account: true },
      orderBy: { account: { code: "asc" } },
    }),
    prisma.financeAccountBalance.findMany({
      where: { period: { companyCode: period.companyCode, year: period.year } },
      include: { account: true },
    }),
    prisma.financeBalanceReclassAdjustment.findMany({
      where: { periodId: targetPeriodId, status: { in: ["approved", "adjusted"] } },
      select: { sourceAccountCode: true, targetAccountCode: true, amount: true },
    }),
  ]);
  const allRows = balanceRows.map((row) => ({
      sourceAccount: row.sourceAccountCode,
      targetAccount: row.targetAccountCode,
      amount: row.amount,
    }));

  return generateReport({
    period,
    balances,
    yearBalances,
    reportType: input.reportType,
    isCanada: period.companyCode === "04",
    reclassEntries: allRows.length > 0 ? allRows : undefined,
  });
}

export async function generateReport(params: GenerateReportParams) {
  const { period, balances, reportType, reclassEntries } = params;

  // balance sheet: mapping-based (unchanged)
  if (reportType === "balance") return generateBalanceSheet(period, balances, reclassEntries);

  // Income statement and cash flow consume source facts directly.
  const statementReport = await generateDirectStatementReport(
    period.companyCode ?? "",
    period.year,
    period.month,
    reportType === "income" ? "incomeStatement" : "cashFlow",
  );

  return NextResponse.json({
    type: reportType,
    period: { id: period.id, year: period.year, month: period.month, companyCode: period.companyCode },
    source: statementReport.source,
    diagnostics: statementReport.diagnostics,
    lines: statementReport.lines,
  });
}
