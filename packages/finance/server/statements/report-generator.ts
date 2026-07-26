import { NextResponse } from "next/server";
import { prisma } from "@workspace/platform/server/prisma";
import { BalanceItem, ReportPeriod, ReclassEntry } from "./report-helpers";
import { generateBalanceSheet } from "./reports/balance-sheet";
import { generateDirectStatementReport } from "./reports/direct";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";
import { loadBalanceSheetPeriodReclassEntries } from "./balance-sheet-reclass-entries";
import {
  isStatementPeriodEnd,
  type StatementPeriodKind,
} from "@workspace/finance/types/statement-period";

export interface GenerateReportParams {
  period: ReportPeriod;
  balances: BalanceItem[];
  yearBalances: BalanceItem[];
  reportType: "balance" | "income" | "cashflow";
  periodKind?: StatementPeriodKind;
  isCanada: boolean;
  /** Approved balance-reclassification entries with precise amounts. */
  reclassEntries?: ReclassEntry[];
  /** Approved reclassification entries from the prior year-end comparative basis. */
  openingReclassEntries?: ReclassEntry[];
}

export interface GenerateFinanceReportInput {
  periodId?: number;
  companyCode?: string;
  year?: number;
  month?: number;
  periodKind?: StatementPeriodKind;
  reportType: "balance" | "income" | "cashflow";
}

export async function generateFinanceReport(input: GenerateFinanceReportInput) {
  const periodKind = input.periodKind ?? "month";
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
  if (!isStatementPeriodEnd(period, periodKind)) {
    return jsonErrorResponse(periodKind === "year" ? "年度报表必须选择12月作为期末" : "季度报表必须选择季度末月份", 400);
  }
  const prefixSet = getTenantProfile().finance.countryReportProfiles.find((profile) => profile.companyCodes.includes(period.companyCode))?.prefixSet ?? "chn";

  if (input.reportType === "income" || input.reportType === "cashflow") {
    return generateReport({
      period,
      balances: [],
      yearBalances: [],
      reportType: input.reportType,
      isCanada: prefixSet === "can",
    });
  }

  const [balances, yearBalances, periodReclassEntries] = await Promise.all([
    prisma.financeAccountBalance.findMany({
      where: { periodId: targetPeriodId },
      include: { account: true },
      orderBy: { account: { code: "asc" } },
    }),
    prisma.financeAccountBalance.findMany({
      where: { period: { companyCode: period.companyCode, year: period.year } },
      include: { account: true },
    }),
    loadBalanceSheetPeriodReclassEntries(period),
  ]);

  return generateReport({
    period,
    balances,
    yearBalances,
    reportType: input.reportType,
    isCanada: prefixSet === "can",
    reclassEntries: periodReclassEntries.closing,
    openingReclassEntries: periodReclassEntries.opening,
  });
}

export async function generateReport(params: GenerateReportParams) {
  const { period, balances, reportType, reclassEntries, openingReclassEntries } = params;

  // balance sheet: mapping-based (unchanged)
  if (reportType === "balance") {
    return generateBalanceSheet(period, balances, reclassEntries, openingReclassEntries);
  }

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
