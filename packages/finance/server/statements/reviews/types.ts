/** P3 Batch 3: review DTOs. */

export type ReviewReportType = "incomeStatement" | "cashFlow";
export type ReviewLineStatus = "pending" | "confirmed" | "adjusted" | "flagged";

const VALID_LINE_STATUSES: ReadonlySet<string> = new Set(["pending", "confirmed", "adjusted", "flagged"]);

export function isValidLineStatus(s: string): s is ReviewLineStatus {
  return VALID_LINE_STATUSES.has(s);
}

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
  /** true when workpaper.version > generatedFromVersion — UI should prompt re-generation. */
  isStale: boolean;
  lines: ReviewLineOutput[];
}

/** Minimal Prisma query result shape consumed by toReviewOutput. */
export interface ReviewLineRecord {
  id: number; lineCode: string; label: string; sortOrder: number;
  systemAmount: number; workpaperAmount: number; adjustedAmount: number | null;
  finalAmount: number; status: string; comment: string | null;
}

export interface ReviewRecord {
  id: number; workpaperId: number; companyCode: string; year: number; month: number;
  reportType: string; status: string; generatedFromVersion: number; note: string | null;
  lines: ReviewLineRecord[];
}
