import {
  loadCashFlowConfig,
  loadIncomeStatementConfig,
  type CashFlowLineRow,
  type IncomeStatementLineRow,
} from "../config/load-config-reports";

export type SupportedReviewReportType = "incomeStatement" | "cashFlow";
export type ReviewLineConfigRow = IncomeStatementLineRow | CashFlowLineRow;

export function validateReportType<T extends SupportedReviewReportType = SupportedReviewReportType>(
  reportType: string,
): T {
  if (reportType !== "incomeStatement" && reportType !== "cashFlow") {
    throw new Error(`不支持的 reportType: ${reportType}，仅支持 incomeStatement / cashFlow`);
  }
  return reportType as T;
}

export async function loadLineConfig(
  companyCode: string,
  year: number,
  reportType: SupportedReviewReportType,
): Promise<ReviewLineConfigRow[]> {
  if (reportType === "incomeStatement") return loadIncomeStatementConfig(companyCode, year);
  return loadCashFlowConfig(companyCode, year);
}
