/** P3 Batch 2: workpaper DTOs and validation. */

export type WorkpaperReportType = "incomeStatement" | "cashFlow";

export interface WorkpaperLineInput {
  lineCode: string;
  manualAmount: number;
  importedAmount: number;
  formulaText?: string | null;
  note?: string | null;
  source?: string | null;
}

export interface WorkpaperLineOutput {
  id: number;
  lineCode: string;
  manualAmount: number;
  importedAmount: number;
  formulaText: string | null;
  note: string | null;
  source: string | null;
  sortOrder: number;
}

export interface WorkpaperOutput {
  id: number;
  companyCode: string;
  year: number;
  month: number;
  reportType: WorkpaperReportType;
  status: string;
  note: string | null;
  lines: WorkpaperLineOutput[];
}

export interface GetWorkpaperParams {
  companyCode: string;
  year: number;
  month: number;
  reportType: WorkpaperReportType;
}

export interface SaveWorkpaperInput {
  companyCode: string;
  year: number;
  month: number;
  reportType: WorkpaperReportType;
  note?: string | null;
  lines: WorkpaperLineInput[];
}
