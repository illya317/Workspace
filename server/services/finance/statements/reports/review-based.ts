/**
 * P3 Batch 6: review-based income / cash flow report generator.
 *
 * Consumes confirmed review.finalAmount. Without confirmed review, returns
 * empty lines + missingConfirmedReview diagnostic.
 *
 * Does NOT touch balanceSheet, statement-mappings, or legacy compute.
 */

import { prisma } from "@/lib/prisma";
import { loadIncomeStatementConfig, loadCashFlowConfig } from "../config/load-config-reports";
import type { IncomeStatementLineRow, CashFlowLineRow } from "../config/load-config-reports";

// ─── types ───────────────────────────────────────────────────

export interface ReportLine {
  lineCode: string;
  label: string;
  amount: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
}

export interface ReportDiagnostic {
  type: "missingConfirmedReview" | "ok";
  message: string;
}

export interface ReviewBasedReport {
  reportType: "incomeStatement" | "cashFlow";
  companyCode: string;
  year: number;
  month: number;
  source: "review" | "empty";
  diagnostics: ReportDiagnostic[];
  lines: ReportLine[];
}

// ─── helpers ─────────────────────────────────────────────────

function isDataLine(c: IncomeStatementLineRow | CashFlowLineRow): boolean {
  if ("isHeader" in c) return !c.isHeader && !c.isTotal && !c.isGrandTotal;
  // CashFlowLineRow has isSubtotal / isGrandTotal
  return !("isSubtotal" in c && c.isSubtotal) && !c.isGrandTotal;
}

// ─── main ────────────────────────────────────────────────────

export async function generateReviewBasedReport(
  companyCode: string,
  year: number,
  month: number,
  reportType: "incomeStatement" | "cashFlow",
): Promise<ReviewBasedReport> {
  // 1. Look for confirmed review
  const review = await prisma.financeStatementReview.findFirst({
    where: { companyCode, year, month, reportType, status: "confirmed" },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  // 2. Load line config for structure
  const config = reportType === "incomeStatement"
    ? await loadIncomeStatementConfig(companyCode, year)
    : await loadCashFlowConfig(companyCode, year);

  if (!review) {
    return {
      reportType, companyCode, year, month,
      source: "empty",
      diagnostics: [{ type: "missingConfirmedReview", message: "当前期间没有已确认校对结果" }],
      lines: config.map((c) => ({
        lineCode: c.lineCode, label: c.label, amount: 0,
        ...("isTotal" in c && c.isTotal ? { isTotal: true as const } : {}),
        ...("isGrandTotal" in c && c.isGrandTotal ? { isGrandTotal: true as const } : {}),
        ...("isSubtotal" in c && c.isSubtotal ? { isTotal: true as const } : {}),
      })),
    };
  }

  // 3. Map review lines to report lines
  const reviewByCode = new Map(review.lines.map((l) => [l.lineCode, l.finalAmount]));
  const lines: ReportLine[] = config.map((c) => {
    const amount = reviewByCode.get(c.lineCode) ?? 0;
    return {
      lineCode: c.lineCode, label: c.label, amount,
      ...("isTotal" in c && c.isTotal ? { isTotal: true as const } : {}),
      ...("isGrandTotal" in c && c.isGrandTotal ? { isGrandTotal: true as const } : {}),
      ...("isSubtotal" in c && c.isSubtotal ? { isTotal: true as const } : {}),
    };
  });

  return {
    reportType, companyCode, year, month,
    source: "review",
    diagnostics: [{ type: "ok", message: `来自已确认校对 #${review.id}` }],
    lines,
  };
}
