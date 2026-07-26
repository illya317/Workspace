import type {
  ConsolidatedOutputLine,
  ConsolidatedReportOutputPackage,
  ConsolidatedStatementOutput,
  StatementReportType,
} from "@workspace/finance/types";
import { getCompanyNameByCode } from "@workspace/platform/server/company-directory";

import { loadConsolidatedReportOutput } from "./consolidated-output-service";
import { generateFinanceReport } from "./report-generator";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";

export type StatementPageSource = "system" | "empty" | "consolidated";

export interface StatementPageLine {
  lineCode: string;
  code: string | null;
  label: string;
  amount: number;
  currentMonthAmount?: number;
  previousAmount: number;
  section: string;
  side: "debit" | "credit";
  direction: "in" | "out" | "net" | null;
  subtract: boolean;
  isHeader: boolean;
  isTotal: boolean;
  isGrandTotal: boolean;
}

export interface StatementPageStatement {
  reportType: StatementReportType;
  label: string;
  source: StatementPageSource;
  diagnostics: string[];
  lines: StatementPageLine[];
  totals: Record<string, number>;
}

export interface StatementPageData {
  mode: "standalone" | "consolidated";
  scope: {
    companyCode: string;
    companyName: string;
    year: number;
    month: number;
    periodKind: StatementPeriodKind;
    batchId: number | null;
    batchStatus: ConsolidatedReportOutputPackage["batch"]["status"] | null;
  };
  statements: StatementPageStatement[];
}

interface StandaloneReportLine {
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

interface StandaloneReportPayload {
  type: "balance" | "income" | "cashflow";
  source?: "system" | "empty";
  diagnostics?: Array<string | { message?: string }>;
  assets?: StandaloneReportLine[];
  liabilities?: StandaloneReportLine[];
  equity?: StandaloneReportLine[];
  lines?: StandaloneReportLine[];
  totalLiabilitiesAndEquity?: number;
  previousTotalLiabilitiesAndEquity?: number;
}

const REPORT_LABELS: Record<StatementReportType, string> = {
  balanceSheet: "资产负债表",
  incomeStatement: "利润表",
  cashFlow: "现金流量表",
};

export class StatementPageDataError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "StatementPageDataError";
  }
}

function money(value: number | undefined) {
  return Number.isFinite(value) ? Math.round((value! + Number.EPSILON) * 100) / 100 : 0;
}

function normalizeLine(line: StandaloneReportLine): StatementPageLine {
  return {
    lineCode: line.lineCode,
    code: line.code?.trim() || null,
    label: line.label,
    amount: money(line.amount),
    ...(line.currentMonthAmount === undefined ? {} : { currentMonthAmount: money(line.currentMonthAmount) }),
    previousAmount: money(line.previousAmount),
    section: line.section,
    side: line.side,
    direction: line.direction ?? null,
    subtract: line.subtract === true,
    isHeader: line.isHeader === true,
    isTotal: line.isTotal === true,
    isGrandTotal: line.isGrandTotal === true,
  };
}

function normalizeConsolidatedLine(line: ConsolidatedOutputLine): StatementPageLine {
  return {
    lineCode: line.lineCode,
    code: line.code,
    label: line.label,
    amount: money(line.amount),
    ...(line.currentMonthAmount === undefined ? {} : { currentMonthAmount: money(line.currentMonthAmount) }),
    previousAmount: money(line.previousAmount),
    section: line.section,
    side: line.side,
    direction: line.direction,
    subtract: line.subtract,
    isHeader: line.isHeader,
    isTotal: line.isTotal,
    isGrandTotal: line.isGrandTotal,
  };
}

function diagnosticMessages(payload: StandaloneReportPayload) {
  return (payload.diagnostics ?? []).map((diagnostic) => (
    typeof diagnostic === "string" ? diagnostic : diagnostic.message?.trim() || "报表存在未说明的诊断事项"
  ));
}

function statementTotals(lines: StatementPageLine[]) {
  return Object.fromEntries(
    lines
      .filter((line) => line.isTotal || line.isGrandTotal)
      .map((line) => [line.lineCode, line.amount]),
  );
}

function standaloneStatement(payload: StandaloneReportPayload): StatementPageStatement {
  const reportType: StatementReportType = payload.type === "balance"
    ? "balanceSheet"
    : payload.type === "income"
      ? "incomeStatement"
      : "cashFlow";
  const lines = (payload.type === "balance"
    ? [...(payload.assets ?? []), ...(payload.liabilities ?? []), ...(payload.equity ?? [])]
    : payload.lines ?? []).map(normalizeLine);
  const totals = statementTotals(lines);
  if (payload.type === "balance") {
    totals.totalAssets = lines.find((line) => line.lineCode === "totalAssets")?.amount ?? 0;
    totals.previousTotalAssets = lines.find((line) => line.lineCode === "totalAssets")?.previousAmount ?? 0;
    totals.totalLiabilitiesAndEquity = money(payload.totalLiabilitiesAndEquity);
    totals.previousTotalLiabilitiesAndEquity = money(payload.previousTotalLiabilitiesAndEquity);
  }
  return {
    reportType,
    label: REPORT_LABELS[reportType],
    source: payload.source ?? "system",
    diagnostics: diagnosticMessages(payload),
    lines,
    totals,
  };
}

function consolidatedStatement(statement: ConsolidatedStatementOutput): StatementPageStatement {
  return {
    reportType: statement.reportType,
    label: statement.label,
    source: "consolidated",
    diagnostics: [],
    lines: statement.lines.map(normalizeConsolidatedLine),
    totals: { ...statement.totals },
  };
}

async function readReportResponse(response: Response): Promise<StandaloneReportPayload> {
  const body = await response.json().catch(() => null) as (StandaloneReportPayload & { error?: unknown }) | null;
  if (!response.ok) {
    throw new StatementPageDataError(
      typeof body?.error === "string" ? body.error : "财务报表读取失败",
      response.status,
    );
  }
  if (!body || !body.type) throw new StatementPageDataError("财务报表返回内容无效", 500);
  return body;
}

export async function loadStandaloneStatementPageData(input: {
  companyCode: string;
  year: number;
  month: number;
  periodKind?: StatementPeriodKind;
}): Promise<StatementPageData> {
  const companyCode = input.companyCode.trim();
  const periodKind = input.periodKind ?? "month";
  const [companyName, balance, income, cashFlow] = await Promise.all([
    getCompanyNameByCode(companyCode),
    generateFinanceReport({ ...input, companyCode, periodKind, reportType: "balance" }).then(readReportResponse),
    generateFinanceReport({ ...input, companyCode, reportType: "income" }).then(readReportResponse),
    generateFinanceReport({ ...input, companyCode, reportType: "cashflow" }).then(readReportResponse),
  ]);
  return {
    mode: "standalone",
    scope: {
      companyCode,
      companyName,
      year: input.year,
      month: input.month,
      periodKind,
      batchId: null,
      batchStatus: null,
    },
    statements: [balance, income, cashFlow].map(standaloneStatement),
  };
}

export async function loadConsolidatedStatementPageData(batchId: number): Promise<StatementPageData> {
  const result = await loadConsolidatedReportOutput(batchId);
  if (!result.ok) throw new StatementPageDataError(result.error, result.status ?? 400);
  const report = result.data.report;
  const companyName = await getCompanyNameByCode(report.batch.parentCompanyCode);
  return {
    mode: "consolidated",
    scope: {
      companyCode: report.batch.parentCompanyCode,
      companyName,
      year: report.batch.year,
      month: report.batch.month,
      periodKind: report.batch.periodKind,
      batchId: report.batch.id,
      batchStatus: report.batch.status,
    },
    statements: report.statements.map(consolidatedStatement),
  };
}
