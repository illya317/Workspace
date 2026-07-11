/** P3 Batch 3: review CRUD + confirm service. */
import { prisma } from "@workspace/platform/server/prisma";
import { computeIncomeSystemAmounts } from "./system-amounts";
import type {
  ReviewReportType, ReviewLineInput, ReviewLineStatus,
  ReviewOutput, ReviewLineOutput, ReviewRecord, ReviewLineRecord,
} from "./types";
import { isValidLineStatus } from "./types";
import { loadLineConfig, validateReportType } from "../shared/report-config";
import {
  buildFinanceIdCommand,
  buildReviewGenerateCommand,
  buildReviewUpdateCommand,
} from "../../domain/finance-validation";

// ─── helpers ─────────────────────────────────────────────────

function resolveFinal(adjusted: number | null | undefined, workpaper: number): number {
  return adjusted != null ? adjusted : workpaper;
}

function toReviewOutput(r: ReviewRecord, workpaperVersion?: number): ReviewOutput {
  const isStale = workpaperVersion != null && workpaperVersion > r.generatedFromVersion;
  return {
    id: r.id, workpaperId: r.workpaperId, companyCode: r.companyCode,
    year: r.year, month: r.month, reportType: r.reportType as ReviewReportType,
    status: r.status, generatedFromVersion: r.generatedFromVersion, note: r.note,
    isStale,
    lines: r.lines.map((l: ReviewLineRecord): ReviewLineOutput => ({
      id: l.id, lineCode: l.lineCode, label: l.label, sortOrder: l.sortOrder,
      systemAmount: l.systemAmount, workpaperAmount: l.workpaperAmount,
      adjustedAmount: l.adjustedAmount, finalAmount: l.finalAmount,
      status: l.status as ReviewLineStatus, comment: l.comment,
    })),
  };
}

function throw409(msg: string): never {
  throw Object.assign(new Error(msg), { statusCode: 409 });
}

function throw400(msg: string): never {
  throw Object.assign(new Error(msg), { statusCode: 400 });
}

// ─── public API ──────────────────────────────────────────────

/** Generate review from workpaper. Returns created flag. */
export async function generateReview(
  workpaperId: number, userId?: number,
): Promise<{ review: ReviewOutput; created: boolean }> {
  const command = buildReviewGenerateCommand(workpaperId, userId);
  if (!command.ok) throw400(command.issue.message);
  const wp = await prisma.financeStatementWorkpaper.findUnique({
    where: { id: command.data.workpaperId },
    include: { lines: true },
  });
  if (!wp) throw new Error("底稿不存在");
  validateReportType(wp.reportType);

  const existing = await prisma.financeStatementReview.findUnique({
    where: { workpaperId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (existing) {
    const isStale = wp.version > existing.generatedFromVersion;
    if (existing.status === "confirmed") {
      if (!isStale) throw409("该底稿已有已确认的校对，不能重新生成");
      // Stale confirmed → regenerate in place (workpaperId is @unique)
    } else if (!isStale) {
      // Draft, not stale → return existing
      return { review: toReviewOutput(existing as ReviewRecord, wp.version), created: false };
    }
    // Draft + stale → fall through to regenerate
  }

  const config = await loadLineConfig(wp.companyCode, wp.year, validateReportType(wp.reportType));
  const sysAmts = wp.reportType === "incomeStatement"
    ? await computeIncomeSystemAmounts(wp.companyCode, wp.year, wp.month)
    : new Map<string, number>();

  const reviewRecord = await prisma.$transaction(async (tx) => {
    const reviewId = existing
      ? (
        await tx.financeStatementReview.update({
          where: { id: existing.id },
          data: {
            status: "draft", generatedFromVersion: wp.version,
            reviewedBy: null, reviewedAt: null, note: null,
            editedBy: command.data.userId ?? null, editedAt: command.data.userId ? new Date() : null,
            version: { increment: 1 },
          },
        })
      ).id
      : (
        await tx.financeStatementReview.create({
          data: {
            workpaperId: wp.id, companyCode: wp.companyCode, year: wp.year,
            month: wp.month, reportType: wp.reportType, status: "draft",
            generatedFromVersion: wp.version, editedBy: command.data.userId ?? null,
            editedAt: command.data.userId ? new Date() : null,
          },
        })
      ).id;

    // Regenerating: delete stale lines before inserting fresh ones
    if (existing) await tx.financeStatementReviewLine.deleteMany({ where: { reviewId } });

    for (let i = 0; i < config.length; i++) {
      const c = config[i];
      const wpl = wp.lines.find((l) => l.lineCode === c.lineCode);
      const wpAmt = (wpl?.manualAmount ?? 0) + (wpl?.importedAmount ?? 0);
      const sys = sysAmts.get(c.lineCode) ?? 0;
      await tx.financeStatementReviewLine.create({
        data: {
          reviewId, lineCode: c.lineCode, label: c.label, sortOrder: i,
          systemAmount: sys, workpaperAmount: wpAmt, finalAmount: wpAmt,
        },
      });
    }
    return tx.financeStatementReview.findUniqueOrThrow({
      where: { id: reviewId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  });

  return { review: toReviewOutput(reviewRecord as ReviewRecord, wp.version), created: true };
}

/** Get review by workpaperId, or by company/year/month/reportType. Returns null if not found. */
export async function getReview(
  params: { workpaperId?: number; companyCode?: string; year?: number; month?: number; reportType?: string },
): Promise<ReviewOutput | null> {
  let where: { workpaperId: number } | { companyCode: string; year: number; month: number; reportType: string };
  if (params.workpaperId) {
    where = { workpaperId: params.workpaperId };
  } else if (params.companyCode && params.year != null && params.month != null && params.reportType) {
    validateReportType(params.reportType);
    where = { companyCode: params.companyCode, year: params.year, month: params.month, reportType: params.reportType };
  } else {
    throw new Error("workpaperId 或 (companyCode, year, month, reportType) 为必填");
  }
  const r = await prisma.financeStatementReview.findFirst({
    where,
    include: { lines: { orderBy: { sortOrder: "asc" } }, workpaper: { select: { version: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!r) return null;
  return toReviewOutput(r as ReviewRecord & { workpaper: { version: number } | null },
    r.workpaper?.version ?? undefined);
}

/** Update review lines (partial: only lines in payload are touched). */
export async function updateReviewLines(
  reviewId: number, lines: ReviewLineInput[], note?: string | null, userId?: number,
): Promise<ReviewOutput> {
  const command = buildReviewUpdateCommand(reviewId, lines, userId);
  if (!command.ok) throw400(command.issue.message);
  const review = await prisma.financeStatementReview.findUnique({
    where: { id: command.data.reviewId },
    include: { lines: true, workpaper: { select: { version: true } } },
  });
  if (!review) throw new Error("校对不存在");
  if (review.status === "confirmed") throw409("已确认的校对不能修改");

  // Validate each input line
  for (const li of lines) {
    if (li.status && !isValidLineStatus(li.status)) {
      throw400(`无效 status "${li.status}"，仅支持 pending/confirmed/adjusted/flagged`);
    }
    if (li.adjustedAmount !== undefined && li.adjustedAmount !== null) {
      if (typeof li.adjustedAmount !== "number" || !Number.isFinite(li.adjustedAmount)) {
        throw400(`lineCode "${li.lineCode}" 的 adjustedAmount 无效：${li.adjustedAmount}（必须为有限数字）`);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const li of lines) {
      const existing = review.lines.find((l) => l.lineCode === li.lineCode);
      if (!existing) throw new Error(`无效 lineCode "${li.lineCode}"，不在校对行中`);
      const adj = li.adjustedAmount !== undefined ? li.adjustedAmount : existing.adjustedAmount;
      await tx.financeStatementReviewLine.update({
        where: { reviewId_lineCode: { reviewId, lineCode: li.lineCode } },
        data: {
          adjustedAmount: adj,
          finalAmount: resolveFinal(adj, existing.workpaperAmount),
          status: li.status ?? existing.status,
          comment: li.comment !== undefined ? li.comment : existing.comment,
        },
      });
    }
    if (note !== undefined) {
      await tx.financeStatementReview.update({
        where: { id: command.data.reviewId },
        data: { note, editedBy: command.data.userId ?? null, editedAt: command.data.userId ? new Date() : null },
      });
    }
  });

  const updated = await prisma.financeStatementReview.findUniqueOrThrow({
    where: { id: command.data.reviewId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, workpaper: { select: { version: true } } },
  });
  return toReviewOutput(updated as ReviewRecord & { workpaper: { version: number } | null },
    updated.workpaper?.version ?? undefined);
}

/** Confirm review: rejects flagged AND pending lines. Only confirmed/adjusted allowed. */
export async function confirmReview(reviewId: number, userId: number): Promise<ReviewOutput> {
  const command = buildFinanceIdCommand(reviewId, "reviewId");
  if (!command.ok) throw400(command.issue.message);
  const editor = buildFinanceIdCommand(userId, "userId");
  if (!editor.ok) throw400(editor.issue.message);
  const review = await prisma.financeStatementReview.findUnique({
    where: { id: command.data.id },
    include: { lines: true, workpaper: { select: { version: true } } },
  });
  if (!review) throw new Error("校对不存在");
  if (review.status === "confirmed") throw409("校对已确认");
  if (review.status === "voided") throw409("校对已作废");

  const flagged = review.lines.filter((l) => l.status === "flagged");
  if (flagged.length > 0) {
    throw409(`有 ${flagged.length} 行被标记(flagged)，不能确认：${flagged.map((l) => l.lineCode).join(", ")}`);
  }
  const pending = review.lines.filter((l) => l.status === "pending");
  if (pending.length > 0) {
    throw409(`有 ${pending.length} 行仍为 pending，请先确认或调整：${pending.map((l) => l.lineCode).join(", ")}`);
  }

  await prisma.financeStatementReview.update({
    where: { id: command.data.id },
    data: { status: "confirmed", reviewedBy: editor.data.id, reviewedAt: new Date() },
  });

  const updated = await prisma.financeStatementReview.findUniqueOrThrow({
    where: { id: command.data.id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, workpaper: { select: { version: true } } },
  });
  return toReviewOutput(updated as ReviewRecord & { workpaper: { version: number } | null },
    updated.workpaper?.version ?? undefined);
}
