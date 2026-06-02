/**
 * P3 Batch 6: review-based income / cash flow report generator.
 *
 * Consumes confirmed review.finalAmount. Returns empty lines + diagnostic
 * when no confirmed review exists or when the review is stale.
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
  type: "missingConfirmedReview" | "staleConfirmedReview" | "ok";
  message: string;
}

export interface ReviewBasedReport {
  reportType: "incomeStatement" | "cashFlow";
  companyCode: string;
  year: number;
  month: number;
  source: "review" | "empty" | "stale";
  diagnostics: ReportDiagnostic[];
  lines: ReportLine[];
}

// ─── helpers ─────────────────────────────────────────────────

type LineConfigRow = IncomeStatementLineRow | CashFlowLineRow;

function configFlags(c: LineConfigRow): Partial<ReportLine> {
  if ("isTotal" in c && c.isTotal) return { isTotal: true as const };
  if ("isGrandTotal" in c && c.isGrandTotal) return { isGrandTotal: true as const };
  if ("isSubtotal" in c && c.isSubtotal) return { isTotal: true as const };
  return {};
}

// ─── main ────────────────────────────────────────────────────

export async function generateReviewBasedReport(
  companyCode: string,
  year: number,
  month: number,
  reportType: "incomeStatement" | "cashFlow",
): Promise<ReviewBasedReport> {
  const config = reportType === "incomeStatement"
    ? await loadIncomeStatementConfig(companyCode, year)
    : await loadCashFlowConfig(companyCode, year);
  const configByCode = new Map(config.map((c) => [c.lineCode, c]));

  // 1. Look for confirmed review
  const review = await prisma.financeStatementReview.findFirst({
    where: { companyCode, year, month, reportType, status: "confirmed" },
    include: { lines: { orderBy: { sortOrder: "asc" } }, workpaper: { select: { version: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (!review) {
    return {
      reportType, companyCode, year, month,
      source: "empty",
      diagnostics: [{ type: "missingConfirmedReview", message: "当前期间没有已确认校对结果" }],
      lines: config.map((c) => ({
        lineCode: c.lineCode, label: c.label, amount: 0, ...configFlags(c),
      })),
    };
  }

  // 2. Stale check: workpaper updated after review was generated
  const wpVersion = review.workpaper?.version ?? 0;
  if (wpVersion > review.generatedFromVersion) {
    return {
      reportType, companyCode, year, month,
      source: "stale",
      diagnostics: [{
        type: "staleConfirmedReview",
        message: `底稿已更新(v${wpVersion})，当前校对为旧快照(v${review.generatedFromVersion})，请重新生成校对`,
      }],
      lines: config.map((c) => ({
        lineCode: c.lineCode, label: c.label, amount: 0, ...configFlags(c),
      })),
    };
  }

  // 3. Build report from review.lines (primary) + config flags
  const lines: ReportLine[] = review.lines.map((rl) => {
    const c = configByCode.get(rl.lineCode);
    return {
      lineCode: rl.lineCode,
      label: rl.label, // review snapshot label, not current config
      amount: rl.finalAmount,
      ...(c ? configFlags(c) : {}),
    };
  });

  return {
    reportType, companyCode, year, month,
    source: "review",
    diagnostics: [{ type: "ok", message: `来自已确认校对 #${review.id}` }],
    lines,
  };
}
