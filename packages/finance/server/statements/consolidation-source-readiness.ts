import type { StatementReportType } from "@workspace/finance/types";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";
import { prisma } from "@workspace/platform/server/prisma";

export interface ConsolidationSourcePeriodFact {
  companyCode: string;
  year: number;
  month: number;
  isClosed: boolean;
  sourceClosed: boolean | null;
  counts: {
    balances: number;
    vouchers: number;
    cashFlowAllocations: number;
  };
  sourceStatuses: Array<{
    glMonthEnd: boolean | null;
    accountingClosed: boolean | null;
    cutoffDate: string | null;
  }>;
}

export interface ConsolidationLedgerCutoffFact {
  companyCode: string;
  cutoffDate: string | null;
}

export interface ConsolidationReportSourceReadiness {
  ready: boolean;
  count: number;
  label: string;
  detail: string;
}

export interface ConsolidationEntitySourceReadiness {
  companyCode: string;
  cutoffDate: string | null;
  periodClosed: boolean;
  periodCoverageComplete: boolean;
  reports: Record<StatementReportType, ConsolidationReportSourceReadiness>;
}

export interface ConsolidationSourceReadiness {
  ready: boolean;
  dataCutoffDate: string | null;
  blockedReasons: string[];
  byCompany: Map<string, ConsolidationEntitySourceReadiness>;
}

function reportStartMonth(month: number, periodKind: StatementPeriodKind) {
  if (periodKind === "year") return 1;
  if (periodKind === "quarter") return month - 2;
  return month;
}

function periodEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function periodLabel(year: number, month: number, periodKind: StatementPeriodKind) {
  if (periodKind === "year") return `${year}年度`;
  if (periodKind === "quarter") return `${year}年第${Math.ceil(month / 3)}季度`;
  return `${year}年${month}月`;
}

function incompleteReport(
  reportType: StatementReportType,
  count: number,
  cutoffReached: boolean,
  periodCoverageComplete: boolean,
  cutoffDate: string | null,
  targetEnd: string,
) {
  if (!cutoffReached) {
    return {
      ready: false,
      count,
      label: reportType === "balanceSheet" && count > 0
        ? "仅有结转余额，期间数据未到齐"
        : "来源截止期未覆盖目标期间",
      detail: cutoffDate
        ? `ERP 数据截止 ${cutoffDate}，目标期末为 ${targetEnd}`
        : `尚无可确认的 ERP 数据截止日期，目标期末为 ${targetEnd}`,
    };
  }
  if (!periodCoverageComplete) {
    return {
      ready: false,
      count,
      label: "期间来源未完整覆盖",
      detail: "报告期间内存在未建立的会计期间",
    };
  }
  const label = reportType === "balanceSheet"
    ? "无期末余额数据"
    : reportType === "incomeStatement"
      ? "无系统账凭证"
      : "无系统账现金流分配";
  return { ready: false, count, label, detail: `ERP 数据已截止 ${cutoffDate ?? targetEnd}，但缺少该报表的来源事实` };
}

export function buildConsolidationSourceReadiness(input: {
  companyCodes: readonly string[];
  year: number;
  month: number;
  periodKind: StatementPeriodKind;
  periods: readonly ConsolidationSourcePeriodFact[];
  imports: readonly ConsolidationLedgerCutoffFact[];
}): ConsolidationSourceReadiness {
  const startMonth = reportStartMonth(input.month, input.periodKind);
  const expectedMonthCount = input.month - startMonth + 1;
  const targetEnd = periodEndDate(input.year, input.month);
  const cutoffByCompany = new Map<string, string>();
  for (const item of input.imports) {
    const cutoffDate = item.cutoffDate?.trim();
    if (!cutoffDate || cutoffByCompany.has(item.companyCode)) continue;
    cutoffByCompany.set(item.companyCode, cutoffDate);
  }
  const byCompany = new Map<string, ConsolidationEntitySourceReadiness>();
  const blockedReasons: string[] = [];
  for (const companyCode of input.companyCodes) {
    const periods = input.periods.filter((item) => item.companyCode === companyCode);
    const targetPeriod = periods.find((item) => item.month === input.month);
    const cutoffDate = cutoffByCompany.get(companyCode) ?? null;
    const cutoffReached = Boolean(cutoffDate && cutoffDate >= targetEnd);
    const periodCoverageComplete = new Set(periods.map((item) => item.month)).size === expectedMonthCount;
    const periodClosed = Boolean(targetPeriod && (
      targetPeriod.isClosed
      || targetPeriod.sourceClosed === true
      || targetPeriod.sourceStatuses.some((status) => (
        Boolean(status.cutoffDate && status.cutoffDate >= targetEnd)
        && (status.glMonthEnd === true || status.accountingClosed === true)
      ))
    ));
    const counts = {
      balanceSheet: targetPeriod?.counts.balances ?? 0,
      incomeStatement: periods.reduce((sum, item) => sum + item.counts.vouchers, 0),
      cashFlow: periods.reduce((sum, item) => sum + item.counts.cashFlowAllocations, 0),
    } satisfies Record<StatementReportType, number>;
    const reports = Object.fromEntries((Object.entries(counts) as Array<[StatementReportType, number]>).map(([reportType, count]) => {
      const hasMinimumSourceFact = count > 0 || reportType !== "balanceSheet" && periodClosed;
      const ready = cutoffReached && periodCoverageComplete && hasMinimumSourceFact;
      const result = ready
        ? {
            ready: true,
            count,
            label: "已就绪",
            detail: `ERP 数据截止 ${cutoffDate}；${periodClosed ? "目标期间已关账" : "目标期间存在来源活动"}`,
          }
        : {
            ...incompleteReport(reportType, count, cutoffReached, periodCoverageComplete, cutoffDate, targetEnd),
            label: "未就绪",
          };
      return [reportType, result];
    })) as Record<StatementReportType, ConsolidationReportSourceReadiness>;

    if (!cutoffReached) {
      blockedReasons.push(`${companyCode} 的 ERP 数据截止 ${cutoffDate ?? "未确认"}，未覆盖 ${targetEnd}`);
    } else if (!periodCoverageComplete) {
      blockedReasons.push(`${companyCode} 未完整覆盖${periodLabel(input.year, input.month, input.periodKind)}会计期间`);
    } else {
      if (!reports.balanceSheet.ready) blockedReasons.push(`${companyCode} 缺少期末余额来源`);
      if (!reports.incomeStatement.ready) blockedReasons.push(`${companyCode} 缺少利润表凭证来源`);
      if (!reports.cashFlow.ready) blockedReasons.push(`${companyCode} 缺少现金流量表分配来源`);
    }
    byCompany.set(companyCode, {
      companyCode,
      cutoffDate,
      periodClosed,
      periodCoverageComplete,
      reports,
    });
  }
  const cutoffDates = [...byCompany.values()].map((item) => item.cutoffDate).filter((value): value is string => Boolean(value));
  return {
    ready: input.companyCodes.length > 0 && blockedReasons.length === 0,
    dataCutoffDate: cutoffDates.length === input.companyCodes.length ? cutoffDates.sort()[0] ?? null : null,
    blockedReasons,
    byCompany,
  };
}

export async function loadConsolidationSourceReadiness(input: {
  companyCodes: readonly string[];
  year: number;
  month: number;
  periodKind: StatementPeriodKind;
}) {
  const startMonth = reportStartMonth(input.month, input.periodKind);
  const [periodRows, importRows] = input.companyCodes.length > 0 ? await Promise.all([
    prisma.financePeriod.findMany({
      where: {
        companyCode: { in: [...input.companyCodes] },
        year: input.year,
        month: { gte: startMonth, lte: input.month },
      },
      select: {
        companyCode: true,
        year: true,
        month: true,
        isClosed: true,
        sourceClosed: true,
        _count: { select: { balances: true, vouchers: true, cashFlowAllocations: true } },
        sourceStatuses: {
          where: { import: { status: "completed" } },
          select: {
            glMonthEnd: true,
            accountingClosed: true,
            import: { select: { cutoffDate: true } },
          },
        },
      },
    }),
    prisma.financeLedgerImport.findMany({
      where: {
        companyCode: { in: [...input.companyCodes] },
        status: "completed",
        cutoffDate: { not: null },
      },
      select: { companyCode: true, cutoffDate: true },
      orderBy: [{ cutoffDate: "desc" }, { importedAt: "desc" }, { id: "desc" }],
    }),
  ]) : [[], []];

  return buildConsolidationSourceReadiness({
    ...input,
    periods: periodRows.map((period) => ({
      companyCode: period.companyCode,
      year: period.year,
      month: period.month,
      isClosed: period.isClosed,
      sourceClosed: period.sourceClosed,
      counts: period._count,
      sourceStatuses: period.sourceStatuses.map((status) => ({
        glMonthEnd: status.glMonthEnd,
        accountingClosed: status.accountingClosed,
        cutoffDate: status.import.cutoffDate,
      })),
    })),
    imports: importRows,
  });
}
