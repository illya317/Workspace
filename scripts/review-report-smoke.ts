/**
 * P3 Batch 6: review-based report smoke.
 *
 * Tests:
 *   1. no confirmed review → empty + missingConfirmedReview
 *   2. confirmed review → report uses review.lines (label/amount from snapshot)
 *   3. stale confirmed review → stale + staleConfirmedReview diagnostic
 *   4. cash flow no review → empty
 *
 * Uses 02/2099/12 to avoid colliding with real data.
 *
 * Usage:
 *   npx tsx scripts/review-report-smoke.ts
 */

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { generateReview, confirmReview } from "../server/services/finance/statements/reviews/service";
import { getOrCreateDraft, saveWorkpaper } from "../server/services/finance/statements/workpapers/service";
import { generateReviewBasedReport } from "../server/services/finance/statements/reports/review-based";

const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });

const CO = "02"; const YR = 2099; const MO = 12;

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

async function cleanup(rt: "incomeStatement" | "cashFlow") {
  const key = { companyCode: CO, year: YR, month: MO, reportType: rt };
  const rv = await p.financeStatementReview.findFirst({ where: key });
  if (rv) await p.financeStatementReview.delete({ where: { id: rv.id } });
  const wp = await p.financeStatementWorkpaper.findUnique({ where: { companyCode_year_month_reportType: key } });
  if (wp) {
    await p.financeStatementWorkpaperLine.deleteMany({ where: { workpaperId: wp.id } });
    await p.financeStatementWorkpaper.delete({ where: { id: wp.id } });
  }
}

async function main() {
  console.log("P3 Batch 6.1 review-report smoke\n");

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

  // ─── 2. Confirmed review → review.lines primary ─────────────
  console.log("\n2. Confirmed review → report from review.lines");
  const wp = await ensureWorkpaper("incomeStatement");
  const gen = await generateReview(wp.id, uid);

  // Adjust: set revenue to 500000, cost to 2000, leave others at workpaperAmount
  await p.financeStatementReviewLine.updateMany({
    where: { reviewId: gen.review.id },
    data: { status: "confirmed" },
  });
  const revLine = gen.review.lines.find(l => l.lineCode === "revenue");
  const costLine = gen.review.lines.find(l => l.lineCode === "cost");
  const rdLine = gen.review.lines.find(l => l.lineCode === "rd");
  if (revLine) await p.financeStatementReviewLine.update({
    where: { reviewId_lineCode: { reviewId: gen.review.id, lineCode: "revenue" } },
    data: { adjustedAmount: 500000, finalAmount: 500000, status: "adjusted" },
  });
  if (costLine) await p.financeStatementReviewLine.update({
    where: { reviewId_lineCode: { reviewId: gen.review.id, lineCode: "cost" } },
    data: { adjustedAmount: null, finalAmount: 2000, status: "confirmed" },
  });

  await confirmReview(gen.review.id, uid);

  const report = await generateReviewBasedReport(CO, YR, MO, "incomeStatement");
  check(report.source === "review", "source === 'review'");
  check(report.diagnostics.some(d => d.type === "ok"), "has 'ok' diagnostic");

  // Verify amounts from review lines
  const rRevenue = report.lines.find(l => l.lineCode === "revenue");
  check(rRevenue?.amount === 500000, `revenue.amount === 500000 (got ${rRevenue?.amount})`);
  const rCost = report.lines.find(l => l.lineCode === "cost");
  check(rCost?.amount === 2000, `cost.amount === 2000 (got ${rCost?.amount})`);
  // Unadjusted line: workpaperAmount = (lineIndex + 1) * 1000; admin is 5th
  const rAdmin = report.lines.find(l => l.lineCode === "admin");
  check(rAdmin?.amount !== undefined, "admin line exists");

  // Verify report structure follows review.lines (label from snapshot, not config)
  check(revLine ? rRevenue?.label === revLine.label : true, "revenue label from review snapshot");
  check(costLine ? rCost?.label === costLine.label : true, "cost label from review snapshot");

  // ─── 3. Stale confirmed review ──────────────────────────────
  console.log("\n3. Stale confirmed review → stale diagnostic");
  // Bump workpaper version by saving again
  const wpAfter = await p.financeStatementWorkpaper.findUniqueOrThrow({
    where: { id: wp.id }, include: { lines: true },
  });
  await saveWorkpaper({
    companyCode: CO, year: YR, month: MO, reportType: "incomeStatement",
    lines: wpAfter.lines.map(l => ({ lineCode: l.lineCode, manualAmount: l.manualAmount + 1, importedAmount: l.importedAmount })),
  }, uid);
  const staleReport = await generateReviewBasedReport(CO, YR, MO, "incomeStatement");
  check(staleReport.source === "stale", "source === 'stale' after workpaper bump");
  check(staleReport.diagnostics.some(d => d.type === "staleConfirmedReview"), "has staleConfirmedReview diagnostic");
  check(staleReport.lines.every(l => l.amount === 0), "stale report: all amounts === 0");

  // ─── 4. Cash flow no review → empty ─────────────────────────
  console.log("\n4. Cash flow no review → empty + diagnostics");
  await cleanup("cashFlow");
  await ensureWorkpaper("cashFlow");
  const cfEmpty = await generateReviewBasedReport(CO, YR, MO, "cashFlow");
  check(cfEmpty.source === "empty", "cashFlow source === 'empty'");
  check(cfEmpty.diagnostics.some(d => d.type === "missingConfirmedReview"), "cashFlow missingConfirmedReview");
  check(cfEmpty.lines.length > 0, `cashFlow has ${cfEmpty.lines.length} lines`);

  // ─── Cleanup ────────────────────────────────────────────────
  await cleanup("incomeStatement");
  await cleanup("cashFlow");

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error("Smoke crashed:", e); process.exit(1); })
  .finally(() => p.$disconnect());
