/**
 * P3 Batch 6: review-based report smoke.
 *
 * Tests:
 *   1. confirmed review → report.lines use reviewLine.finalAmount
 *   2. no confirmed review → empty lines + missingConfirmedReview diagnostic
 *   3. incomeStatement + cashFlow both work
 *
 * Uses 02/2099/12 to avoid colliding with real data.
 *
 * Usage:
 *   npx tsx scripts/review-report-smoke.ts
 */

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { generateReview } from "../server/services/finance/statements/reviews/service";
import { confirmReview } from "../server/services/finance/statements/reviews/service";
import { getOrCreateDraft, saveWorkpaper } from "../server/services/finance/statements/workpapers/service";
import { generateReviewBasedReport } from "../server/services/finance/statements/reports/review-based";
import type { ReviewBasedReport } from "../server/services/finance/statements/reports/review-based";

const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });

const CO = "02"; const YR = 2099; const MO = 12;
const FMT = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function ensureWorkpaper(rt: "incomeStatement" | "cashFlow") {
  const key = { companyCode: CO, year: YR, month: MO, reportType: rt };
  let wp = await p.financeStatementWorkpaper.findUnique({ where: { companyCode_year_month_reportType: key } });
  if (!wp) {
    const draft = await getOrCreateDraft(key);
    const saved = await saveWorkpaper({ ...key, lines: draft.lines.map((l, i) => ({ lineCode: l.lineCode, manualAmount: (i + 1) * 1000, importedAmount: 0 })) });
    wp = await p.financeStatementWorkpaper.findUniqueOrThrow({ where: { id: saved.id } });
  }
  return wp;
}

async function cleanup(reportType: "incomeStatement" | "cashFlow") {
  const key = { companyCode: CO, year: YR, month: MO, reportType };
  const rv = await p.financeStatementReview.findFirst({ where: key });
  if (rv) await p.financeStatementReview.delete({ where: { id: rv.id } });
  const wp = await p.financeStatementWorkpaper.findUnique({ where: { companyCode_year_month_reportType: key } });
  if (wp) {
    await p.financeStatementWorkpaperLine.deleteMany({ where: { workpaperId: wp.id } });
    await p.financeStatementWorkpaper.delete({ where: { id: wp.id } });
  }
}

async function main() {
  console.log("P3 Batch 6 review-report smoke\n");

  // Get a valid user for FK constraints
  const adminUser = await p.user.findFirst({ where: { canLogin: true }, select: { id: true } });
  const uid = adminUser?.id ?? 0;

  let passed = 0, failed = 0;
  function check(cond: boolean, msg: string) { if (cond) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}`); } }

  // ─── 1. No confirmed review → empty ────────────────────────
  console.log("1. No confirmed review → empty + diagnostics");
  await cleanup("incomeStatement");
  const empty = await generateReviewBasedReport(CO, YR, MO, "incomeStatement");
  check(empty.source === "empty", "source === 'empty'");
  check(empty.diagnostics.some(d => d.type === "missingConfirmedReview"), "has missingConfirmedReview diagnostic");
  check(empty.lines.every(l => l.amount === 0), "all amounts === 0");
  check(empty.lines.length > 0, `has ${empty.lines.length} lines`);

  // ─── 2. Confirmed review → finalAmount ──────────────────────
  console.log("\n2. Confirmed review → report uses finalAmount");
  const wp = await ensureWorkpaper("incomeStatement");
  const gen = await generateReview(wp.id, uid);
  // Adjust a couple lines so finalAmount differs
  await p.financeStatementReviewLine.updateMany({
    where: { reviewId: gen.review.id },
    data: { status: "confirmed" },
  });
  // Set specific adjustedAmounts
  await p.financeStatementReviewLine.update({
    where: { reviewId_lineCode: { reviewId: gen.review.id, lineCode: "revenue" } },
    data: { adjustedAmount: 500000, finalAmount: 500000, status: "adjusted" },
  });
  await p.financeStatementReviewLine.update({
    where: { reviewId_lineCode: { reviewId: gen.review.id, lineCode: "cost" } },
    data: { adjustedAmount: null, finalAmount: 2000, status: "confirmed" },
  });
  await confirmReview(gen.review.id, uid);

  const report = await generateReviewBasedReport(CO, YR, MO, "incomeStatement");
  check(report.source === "review", "source === 'review'");
  check(report.diagnostics.some(d => d.type === "ok"), "has 'ok' diagnostic");
  const revLine = report.lines.find(l => l.lineCode === "revenue");
  check(revLine?.amount === 500000, `revenue.amount === 500000 (got ${revLine?.amount})`);
  const costLine = report.lines.find(l => l.lineCode === "cost");
  check(costLine?.amount === 2000, `cost.amount === 2000 (got ${costLine?.amount})`);
  // Unadjusted line should have workpaperAmount as finalAmount
  const adminLine = report.lines.find(l => l.lineCode === "admin");
  check(adminLine?.amount === 5000, `admin.amount === 5000 (workpaper: 5th line * 1000, got ${adminLine?.amount})`);

  // ─── 3. Cash flow no review → empty + diagnostics ──────────
  console.log("\n3. Cash flow no review → empty + diagnostics");
  await cleanup("cashFlow");
  await ensureWorkpaper("cashFlow");
  const cfEmpty = await generateReviewBasedReport(CO, YR, MO, "cashFlow");
  check(cfEmpty.source === "empty", "cashFlow source === 'empty'");
  check(cfEmpty.diagnostics.some(d => d.type === "missingConfirmedReview"), "cashFlow missingConfirmedReview");
  check(cfEmpty.lines.length > 0, `cashFlow has ${cfEmpty.lines.length} lines`);

  // ─── 4. Cleanup ─────────────────────────────────────────────
  await cleanup("incomeStatement");
  await cleanup("cashFlow");

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error("Smoke crashed:", e); process.exit(1); })
  .finally(() => p.$disconnect());
