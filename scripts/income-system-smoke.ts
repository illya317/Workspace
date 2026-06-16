/**
 * P3 Batch 5.1: income statement systemAmount smoke.
 *
 * Tests:
 *   1. incomeStatement review → systemAmount populated (not all zero).
 *   2. cashFlow review → systemAmount all zero.
 *   3. Header/total/grandTotal lines → systemAmount = 0.
 *   4. Print per-line: label, prefixes, systemAmount, workpaperAmount, diff.
 *
 * Uses 02/2025/12 as sample. Creates a temp workpaper if none exists.
 *
 * Usage:
 *   npx tsx scripts/income-system-smoke.ts [companyCode] [year] [month]
 */

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { requireDatabasePath } from "./lib/database-url.js";
import { generateReview, getReview } from "../server/services/finance/statements/reviews/service";
import { getOrCreateDraft, saveWorkpaper } from "../server/services/finance/statements/workpapers/service";
import { computeIncomeSystemAmounts } from "../server/services/finance/statements/reviews/system-amounts";

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: requireDatabasePath() }) });

const CO = process.argv[2] || "02";
const YR = parseInt(process.argv[3] || "2025", 10);
const MO = parseInt(process.argv[4] || "12", 10);

const FMT = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  console.log(`P3 Batch 5.1 income systemAmount smoke — ${CO}/${YR}/${MO}\n`);

  // ─── 1. Prepare workpaper ──────────────────────────────────
  console.log("1. Prepare workpaper");
  let wp = await prisma.financeStatementWorkpaper.findUnique({
    where: { companyCode_year_month_reportType: { companyCode: CO, year: YR, month: MO, reportType: "incomeStatement" } },
    include: { lines: true },
  });
  if (!wp) {
    const draft = await getOrCreateDraft({ companyCode: CO, year: YR, month: MO, reportType: "incomeStatement" });
    const saved = await saveWorkpaper({ companyCode: CO, year: YR, month: MO, reportType: "incomeStatement", lines: draft.lines.map(l => ({ lineCode: l.lineCode, manualAmount: 0, importedAmount: 0 })) });
    wp = await prisma.financeStatementWorkpaper.findUniqueOrThrow({ where: { id: saved.id }, include: { lines: true } });
    console.log(`   created workpaper id=${wp.id}`);
  } else {
    console.log(`   using existing workpaper id=${wp.id}`);
  }

  // ─── 2. Generate / read incomeStatement review ─────────────
  console.log("\n2. Income statement review");
  let rv = await getReview({ workpaperId: wp.id });
  if (!rv) {
    const gen = await generateReview(wp.id);
    rv = gen.review;
    console.log(`   generated review id=${rv.id} (created=${gen.created})`);
  } else {
    console.log(`   existing review id=${rv.id} status=${rv.status}`);
  }

  // ─── 3. Income statement table ─────────────────────────────
  console.log("\n3. Income Statement systemAmount vs workpaperAmount\n");
  const incLines = rv.lines.filter(l => {
    const isSpecial = l.label.includes("一、") || l.label.includes("二、") || l.label.includes("三、") || l.label.includes("四、") || l.label.includes("五、");
    return !isSpecial; // header-like labels
  });
  let incNonZero = 0, incTotal = 0;
  console.log("  lineCode                                 systemAmt   workpaperAmt          diff");
  console.log("  ──────────────────────────────────────── ─────────── ─────────── ─────────────");
  for (const l of rv.lines) {
    const isSpecial = l.systemAmount === 0 && l.workpaperAmount === 0 && ["operatingProfit", "totalProfit", "netProfit"].includes(l.lineCode);
    const diff = l.workpaperAmount - l.systemAmount;
    if (l.systemAmount !== 0) incNonZero++;
    incTotal++;
    console.log(`  ${l.lineCode.padEnd(40)} ${FMT(l.systemAmount).padStart(11)} ${FMT(l.workpaperAmount).padStart(11)} ${FMT(diff).padStart(13)}  ${l.label}`);
  }

  // ─── 4. Cashflow review ────────────────────────────────────
  console.log("\n4. Cash flow review");
  let cfWp = await prisma.financeStatementWorkpaper.findUnique({
    where: { companyCode_year_month_reportType: { companyCode: CO, year: YR, month: MO, reportType: "cashFlow" } },
  });
  if (!cfWp) {
    const draft = await getOrCreateDraft({ companyCode: CO, year: YR, month: MO, reportType: "cashFlow" });
    const saved = await saveWorkpaper({ companyCode: CO, year: YR, month: MO, reportType: "cashFlow", lines: draft.lines.map(l => ({ lineCode: l.lineCode, manualAmount: 0, importedAmount: 0 })) });
    cfWp = await prisma.financeStatementWorkpaper.findUniqueOrThrow({ where: { id: saved.id }, include: { lines: true } });
  }
  let cfRv = await getReview({ workpaperId: cfWp.id });
  if (!cfRv) {
    const gen = await generateReview(cfWp.id);
    cfRv = gen.review;
    console.log(`   generated cashFlow review id=${cfRv.id}`);
  } else {
    console.log(`   existing cashFlow review id=${cfRv.id}`);
  }
  const cfNonZero = cfRv.lines.filter(l => l.systemAmount !== 0);
  console.log(`   lines with systemAmount != 0: ${cfNonZero.length}`);

  // ─── 5. Header/total/grandTotal check ──────────────────────
  console.log("\n5. Header/total/grandTotal systemAmount check");
  const specialCodes = new Set(["operatingProfit", "totalProfit", "netProfit", "operatingInSubtotal", "operatingOutSubtotal", "operatingNet", "investingInSubtotal", "investingOutSubtotal", "investingNet", "financingInSubtotal", "financingOutSubtotal", "financingNet", "netIncrease", "endingCash", "openingCash", "fxEffect"]);
  const specialLines = [...rv.lines, ...cfRv.lines].filter(l => l.systemAmount !== 0 && specialCodes.has(l.lineCode));
  console.log(`   special lines with non-zero systemAmount: ${specialLines.length}`);
  if (specialLines.length > 0) specialLines.forEach(l => console.log(`     ${l.lineCode}: ${FMT(l.systemAmount)}`));

  // ─── 6. Raw compute via system-amounts service ─────────────
  console.log("\n6. Raw computeIncomeSystemAmounts output");
  const raw = await computeIncomeSystemAmounts(CO, YR, MO);
  const rawNonZero = [...raw.entries()].filter(([, v]) => v !== 0);
  console.log(`   lines with non-zero systemAmount: ${rawNonZero.length}`);
  for (const [code, amt] of rawNonZero.slice(0, 10)) {
    console.log(`     ${code}: ${FMT(amt)}`);
  }
  if (rawNonZero.length > 10) console.log(`     ... and ${rawNonZero.length - 10} more`);

  // ─── 7. Assertions ─────────────────────────────────────────
  console.log("\n7. Assertions");
  let pass = 0, fail = 0;
  function check(cond: boolean, msg: string) { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } }

  check(incNonZero > 0, `incomeStatement: ${incNonZero} lines have non-zero systemAmount`);
  check(cfNonZero.length === 0, "cashFlow: all systemAmount === 0");
  check(specialLines.length === 0, "header/total/grandTotal: systemAmount === 0");
  // Verify finalAmount is NOT derived from systemAmount
  const finalFromSys = rv.lines.filter(l => l.finalAmount === l.systemAmount && l.systemAmount !== 0 && l.adjustedAmount === null && l.workpaperAmount !== l.systemAmount);
  check(finalFromSys.length === 0, "finalAmount != systemAmount (not auto-consumed)");

  console.log(`\n  ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => { console.error("Smoke crashed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
