export type StatementSourcePackageStatus = "draft" | "submitted" | "rejected";
export type StatementSourceReportType = "balanceSheet" | "incomeStatement" | "cashFlow";

export interface StatementSourcePackageSheetSummary {
  reportType: StatementSourceReportType;
  previousYear: number;
  currentYear: number;
  lineCount: number;
}

export interface StatementSourcePackageSnapshot {
  id: number;
  companyId: number;
  companyCode: string;
  companyName: string;
  year: number;
  month: number;
  revision: number;
  version: number;
  status: StatementSourcePackageStatus;
  fileName: string;
  fileSize: number;
  fileChecksum: string;
  parsedCompanyName: string;
  note: string | null;
  uploadedBy: number;
  uploadedAt: string;
  submittedBy: number | null;
  submittedAt: string | null;
  rejectionReason: string | null;
  sheets: StatementSourcePackageSheetSummary[];
}

export interface SubmitStatementSourcePackageInput {
  expectedVersion: number;
  note?: string | null;
}
