import type { StatementReportType } from "./statement-shared";
import type { StatementPeriodKind } from "./statement-period";

export type ConsolidatedOutputLineSide = "debit" | "credit";
export type ConsolidatedOutputCashDirection = "in" | "out" | "net";

export interface ConsolidatedOutputEntityAmount {
  entitySnapshotId: number;
  companyCode: string;
  companyName: string;
  role: "parent" | "subsidiary";
  amount: number;
  currentMonthAmount?: number;
  previousAmount: number;
}

export interface ConsolidatedOutputLine {
  lineCode: string;
  label: string;
  code: string | null;
  amount: number;
  currentMonthAmount?: number;
  previousAmount: number;
  section: string;
  side: ConsolidatedOutputLineSide;
  direction: ConsolidatedOutputCashDirection | null;
  subtract: boolean;
  isHeader: boolean;
  isTotal: boolean;
  isGrandTotal: boolean;
  sourceAmount: number;
  adjustmentAmount: number;
  currentMonthSourceAmount?: number;
  currentMonthAdjustmentAmount?: number;
  previousSourceAmount?: number;
  previousAdjustmentAmount?: number;
  /** New snapshots retain the translated contribution from every entity. Optional for historical locked snapshots. */
  entityAmounts?: ConsolidatedOutputEntityAmount[];
}

export interface ConsolidatedStatementOutput {
  reportType: StatementReportType;
  label: string;
  lines: ConsolidatedOutputLine[];
  totals: Record<string, number>;
}

export interface ConsolidatedReportOutputPackage {
  batch: {
    id: number;
    parentCompanyId: number;
    parentCompanyCode: string;
    parentCompanyName: string;
    year: number;
    month: number;
    periodKind: StatementPeriodKind;
    version: number;
    revision: number;
    status: "draft" | "submitted" | "reviewed" | "locked" | "published";
    baseBatchId: number | null;
    scopeFingerprint: string;
    sourceFingerprint: string;
    rateFingerprint: string;
    createdBy: number;
    submittedBy: number | null;
    submittedAt: string | null;
    reviewedBy: number | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    lockedBy: number | null;
    lockedAt: string | null;
    publishedBy: number | null;
    publishedAt: string | null;
  };
  statements: ConsolidatedStatementOutput[];
  sourceCount: number;
  approvedEntryCount: number;
  generatedAt: string;
}
