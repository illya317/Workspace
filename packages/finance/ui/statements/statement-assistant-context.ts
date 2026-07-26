import type { PageAssistantOpenInput } from "@workspace/core/ui";
import type { StatementReportType } from "@workspace/finance/types";

const STANDALONE_REPORT_LABELS = {
  balance: "资产负债表",
  income: "利润表",
  cashflow: "现金流量表",
} as const;

const CONSOLIDATED_REPORT_LABELS: Record<StatementReportType, string> = {
  balanceSheet: "合并资产负债表",
  incomeStatement: "合并利润表",
  cashFlow: "合并现金流量表",
};

export function buildStandaloneStatementAssistantContext(input: {
  companyCode: string;
  companyName: string;
  year: number;
  month: number;
  reportType: keyof typeof STANDALONE_REPORT_LABELS;
}): Pick<PageAssistantOpenInput, "contextLabel" | "sourceContext"> {
  const reportLabel = STANDALONE_REPORT_LABELS[input.reportType];
  return {
    contextLabel: `财务报表 / ${input.companyName} / ${input.year}年${input.month}月 / ${reportLabel} / 数据源：当前页面实时报表，不使用资料库`,
    sourceContext: {
      navigationLabel: "财务报表",
      activeKey: "statements",
      activeLabel: "财务报表",
      activeChildKey: `mode:standalone;company:${input.companyCode};year:${input.year};month:${input.month};report:${input.reportType}`,
      activeChildLabel: `${input.companyName} · ${input.year}年${input.month}月 · ${reportLabel}`,
    },
  };
}

export function buildConsolidatedStatementAssistantContext(input: {
  batchId: number;
  parentName: string;
  year: number;
  month: number;
  reportType: StatementReportType;
}): Pick<PageAssistantOpenInput, "contextLabel" | "sourceContext"> {
  const reportLabel = CONSOLIDATED_REPORT_LABELS[input.reportType];
  return {
    contextLabel: `财务报表 / ${input.parentName} / ${input.year}年${input.month}月 / ${reportLabel} / 批次 ${input.batchId} / 数据源：当前页面实时报表，不使用资料库`,
    sourceContext: {
      navigationLabel: "财务报表",
      activeKey: "consolidation",
      activeLabel: "合并报表",
      activeChildKey: `mode:consolidated;batch:${input.batchId};year:${input.year};month:${input.month};report:${input.reportType}`,
      activeChildLabel: `${input.parentName} · ${input.year}年${input.month}月 · ${reportLabel}`,
    },
  };
}
