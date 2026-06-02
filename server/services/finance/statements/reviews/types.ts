/** P3 Batch 3: review DTOs. */

export type ReviewReportType = "incomeStatement" | "cashFlow";
export type ReviewLineStatus = "pending" | "confirmed" | "adjusted" | "flagged";

export interface ReviewLineInput {
  lineCode: string;
  adjustedAmount?: number | null;
  status?: ReviewLineStatus;
  comment?: string | null;
}

export interface ReviewLineOutput {
  id: number;
  lineCode: string;
  label: string;
  sortOrder: number;
  systemAmount: number;
  workpaperAmount: number;
  adjustedAmount: number | null;
  finalAmount: number;
  status: ReviewLineStatus;
  comment: string | null;
}

export interface ReviewOutput {
  id: number;
  workpaperId: number;
  companyCode: string;
  year: number;
  month: number;
  reportType: ReviewReportType;
  status: string;
  generatedFromVersion: number;
  note: string | null;
  lines: ReviewLineOutput[];
}
