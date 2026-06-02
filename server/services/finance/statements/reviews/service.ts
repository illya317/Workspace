/** P3 Batch 3: review CRUD + confirm service. */
import { prisma } from "@/lib/prisma";
import { loadIncomeStatementConfig, loadCashFlowConfig } from "../config/load-config-reports";
import type { ReviewReportType, ReviewLineInput, ReviewOutput, ReviewLineOutput } from "./types";

// ─── helpers ─────────────────────────────────────────────────

function validateReportType(rt: string): ReviewReportType {
  if (rt !== "incomeStatement" && rt !== "cashFlow") {
    throw new Error(`不支持的 reportType: ${rt}，仅支持 incomeStatement / cashFlow`);
  }
  return rt;
}

function resolveFinal(adjusted: number | null | undefined, workpaper: number): number {
  return adjusted != null ? adjusted : workpaper;
}

async function loadLineConfig(companyCode: string, year: number, reportType: ReviewReportType) {
  if (reportType === "incomeStatement") return loadIncomeStatementConfig(companyCode, year);
  return loadCashFlowConfig(companyCode, year);
}

function toReviewOutput(r: any): ReviewOutput {
  return {
    id: r.id, workpaperId: r.workpaperId, companyCode: r.companyCode,
    year: r.year, month: r.month, reportType: r.reportType as ReviewReportType,
    status: r.status, generatedFromVersion: r.generatedFromVersion, note: r.note,
    lines: (r.lines || []).map((l: any): ReviewLineOutput => ({
      id: l.id, lineCode: l.lineCode, label: l.label, sortOrder: l.sortOrder,
      systemAmount: l.systemAmount, workpaperAmount: l.workpaperAmount,
      adjustedAmount: l.adjustedAmount, finalAmount: l.finalAmount,
      status: l.status, comment: l.comment,
    })),
  };
}

// ─── public API ──────────────────────────────────────────────

/** Generate review from workpaper. If draft review exists, return it (no overwrite). */
export async function generateReview(workpaperId: number, userId?: number): Promise<ReviewOutput> {
  const wp = await prisma.financeStatementWorkpaper.findUnique({
    where: { id: workpaperId },
    include: { lines: true },
  });
  if (!wp) throw new Error("底稿不存在");
  const reportType = validateReportType(wp.reportType);

  const existing = await prisma.financeStatementReview.findUnique({
    where: { workpaperId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (existing) {
    if (existing.status === "confirmed") {
      throw Object.assign(new Error("该底稿已有已确认的校对，不能重新生成"), { statusCode: 409 });
    }
    return toReviewOutput(existing);
  }

  const config = await loadLineConfig(wp.companyCode, wp.year, reportType);

  const review = await prisma.$transaction(async (tx) => {
    const r = await tx.financeStatementReview.create({
      data: {
        workpaperId: wp.id, companyCode: wp.companyCode, year: wp.year,
        month: wp.month, reportType: wp.reportType, status: "draft",
        generatedFromVersion: wp.version, editedBy: userId ?? null,
        editedAt: userId ? new Date() : null,
      },
    });
    for (let i = 0; i < config.length; i++) {
      const c = config[i];
      const wpl = wp.lines.find((l) => l.lineCode === c.lineCode);
      const wpAmt = (wpl?.manualAmount ?? 0) + (wpl?.importedAmount ?? 0);
      await tx.financeStatementReviewLine.create({
        data: {
          reviewId: r.id, lineCode: c.lineCode, label: c.label, sortOrder: i,
          systemAmount: 0, workpaperAmount: wpAmt, finalAmount: wpAmt,
        },
      });
    }
    return tx.financeStatementReview.findUniqueOrThrow({
      where: { id: r.id },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  });

  return toReviewOutput(review);
}

/** Get review by workpaperId, or by company/year/month/reportType. Returns null if not found. */
export async function getReview(
  params: { workpaperId?: number; companyCode?: string; year?: number; month?: number; reportType?: string },
): Promise<ReviewOutput | null> {
  let where: any;
  if (params.workpaperId) {
    where = { workpaperId: params.workpaperId };
  } else if (params.companyCode && params.year != null && params.month != null && params.reportType) {
    where = { companyCode: params.companyCode, year: params.year, month: params.month, reportType: params.reportType };
  } else {
    throw new Error("workpaperId 或 (companyCode, year, month, reportType) 为必填");
  }
  const r = await prisma.financeStatementReview.findFirst({
    where,
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return r ? toReviewOutput(r) : null;
}

/** Update review lines (partial: only lines in payload are touched). */
export async function updateReviewLines(
  reviewId: number, lines: ReviewLineInput[], note?: string | null, userId?: number,
): Promise<ReviewOutput> {
  const review = await prisma.financeStatementReview.findUnique({
    where: { id: reviewId },
    include: { lines: true },
  });
  if (!review) throw new Error("校对不存在");
  if (review.status === "confirmed") {
    throw Object.assign(new Error("已确认的校对不能修改"), { statusCode: 409 });
  }

  await prisma.$transaction(async (tx) => {
    for (const li of lines) {
      const existing = review.lines.find((l) => l.lineCode === li.lineCode);
      if (!existing) throw new Error(`无效 lineCode "${li.lineCode}"，不在校对行中`);
      await tx.financeStatementReviewLine.update({
        where: { reviewId_lineCode: { reviewId, lineCode: li.lineCode } },
        data: {
          adjustedAmount: li.adjustedAmount ?? null,
          finalAmount: resolveFinal(li.adjustedAmount, existing.workpaperAmount),
          status: li.status ?? existing.status,
          comment: li.comment !== undefined ? li.comment : existing.comment,
        },
      });
    }
    if (note !== undefined) {
      await tx.financeStatementReview.update({
        where: { id: reviewId },
        data: { note, editedBy: userId ?? null, editedAt: userId ? new Date() : null },
      });
    }
  });

  const updated = await prisma.financeStatementReview.findUniqueOrThrow({
    where: { id: reviewId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  return toReviewOutput(updated);
}

/** Confirm review: all non-header lines must not be pending, no flagged allowed. */
export async function confirmReview(reviewId: number, userId: number): Promise<ReviewOutput> {
  const review = await prisma.financeStatementReview.findUnique({
    where: { id: reviewId },
    include: { lines: true },
  });
  if (!review) throw new Error("校对不存在");
  if (review.status === "confirmed") throw Object.assign(new Error("校对已确认"), { statusCode: 409 });
  if (review.status === "voided") throw Object.assign(new Error("校对已作废"), { statusCode: 409 });

  const flagged = review.lines.filter((l) => l.status === "flagged");
  if (flagged.length > 0) {
    throw new Error(`有 ${flagged.length} 行被标记(flagged)，不能确认：${flagged.map((l) => l.lineCode).join(", ")}`);
  }

  await prisma.financeStatementReview.update({
    where: { id: reviewId },
    data: { status: "confirmed", reviewedBy: userId, reviewedAt: new Date() },
  });

  const updated = await prisma.financeStatementReview.findUniqueOrThrow({
    where: { id: reviewId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  return toReviewOutput(updated);
}
