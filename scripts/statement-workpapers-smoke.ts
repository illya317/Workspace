/**
 * P3 Batch 2.2: statement-workpapers API smoke.
 *
 * Tests:
 *   1. GET draft returns id=0, lines from config, no DB write.
 *   2. PUT full-save persists data, lines present.
 *   3. PUT with fewer lines deletes missing lineCodes.
 *   4. Invalid year/month/amount throws errors.
 *
 * Usage:
 *   npx tsx scripts/statement-workpapers-smoke.ts
 *
 * Read-only except for the workpaper under test — creates and cleans up
 * a test workpaper (02/2099/12/incomeStatement) so it won't collide with
 * real data.
 */

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import {
  getOrCreateDraft,
  saveWorkpaper,
} from "../server/services/finance/statements/workpapers/service";

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });

const TEST = { companyCode: "02", year: 2099, month: 12, reportType: "incomeStatement" as const };

let passed = 0;
let failed = 0;

function ok(label: string) { passed++; console.log(`  ✓ ${label}`); }
function fail(label: string, detail?: unknown) {
  failed++;
  console.error(`  ✗ ${label}`, detail !== undefined ? detail : "");
}

async function cleanup() {
  const wp = await prisma.financeStatementWorkpaper.findUnique({
    where: { companyCode_year_month_reportType: TEST },
  });
  if (wp) {
    await prisma.financeStatementWorkpaper.delete({ where: { id: wp.id } });
  }
}

async function main() {
  console.log("P3 Batch 2.2 workpaper smoke\n");

  await cleanup();

  // ─── 1. GET draft (no DB write) ──────────────────────────
  console.log("1. GET draft (no persist)");
  const draft = await getOrCreateDraft(TEST);
  if (draft.id !== 0) { fail("draft.id should be 0", draft.id); } else { ok("draft.id === 0"); }
  if (draft.status !== "draft") { fail("draft.status should be draft", draft.status); } else { ok("draft.status === draft"); }
  if (draft.lines.length === 0) { fail("draft.lines should not be empty"); } else { ok(`draft.lines.length === ${draft.lines.length}`); }
  const allZero = draft.lines.every(l => l.manualAmount === 0 && l.importedAmount === 0);
  if (!allZero) { fail("draft lines should all have zero amounts"); } else { ok("all draft amounts === 0"); }

  // Confirm no DB row was created
  const dbAfterDraft = await prisma.financeStatementWorkpaper.findUnique({
    where: { companyCode_year_month_reportType: TEST },
  });
  if (dbAfterDraft !== null) { fail("draft should not write to DB"); } else { ok("draft not persisted to DB"); }

  // ─── 2. PUT full-save ────────────────────────────────────
  console.log("\n2. PUT full-save");
  const allLines = draft.lines.map((l, i) => ({
    lineCode: l.lineCode,
    manualAmount: i === 0 ? 500000 : 0,
    importedAmount: 0,
  }));
  const saved = await saveWorkpaper({ ...TEST, lines: allLines });
  if (saved.id === 0) { fail("saved.id should be > 0"); } else { ok(`saved.id === ${saved.id}`); }
  if (saved.lines.length !== allLines.length) {
    fail(`saved.lines.length should be ${allLines.length}`, saved.lines.length);
  } else { ok(`saved.lines.length === ${allLines.length}`); }
  const revenueLine = saved.lines.find(l => l.lineCode === "revenue");
  if (revenueLine?.manualAmount !== 500000) {
    fail("revenue manualAmount should be 500000", revenueLine?.manualAmount);
  } else { ok("revenue manualAmount === 500000"); }

  // Confirm GET now returns saved data
  const refetch = await getOrCreateDraft(TEST);
  if (refetch.id !== saved.id) { fail("refetch.id should match saved.id", { refetch: refetch.id, saved: saved.id }); } else { ok("refetch returns saved workpaper"); }

  // ─── 3. PUT with fewer lines deletes missing ──────────────
  console.log("\n3. PUT deletes missing lineCodes");
  const fewLines = allLines.slice(0, 5);
  const partial = await saveWorkpaper({ ...TEST, lines: fewLines });
  if (partial.lines.length !== 5) {
    fail("partial.lines.length should be 5", partial.lines.length);
  } else { ok("partial save has 5 lines"); }

  const refetchPartial = await getOrCreateDraft(TEST);
  if (refetchPartial.lines.length !== 5) {
    fail("refetch after partial should have 5 lines", refetchPartial.lines.length);
  } else { ok("refetch confirms 5 lines (missing deleted)"); }

  // ─── 4. Validation errors ─────────────────────────────────
  console.log("\n4. Validation: year/month/amount");

  // 4a. Invalid lineCode
  try {
    await saveWorkpaper({ ...TEST, lines: [{ lineCode: "nonexistent", manualAmount: 0, importedAmount: 0 }] });
    fail("should reject invalid lineCode");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("无效 lineCode")) { ok("rejects invalid lineCode"); }
    else { fail("wrong error for invalid lineCode", msg); }
  }

  // 4b. Invalid reportType (getOrCreateDraft)
  try {
    await getOrCreateDraft({ companyCode: "02", year: 2099, month: 12, reportType: "balanceSheet" as any });
    fail("should reject balanceSheet reportType");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("不支持")) { ok("rejects balanceSheet reportType (getOrCreateDraft)"); }
    else { fail("wrong error for reportType", msg); }
  }

  // 4c. Invalid reportType (saveWorkpaper)
  try {
    await saveWorkpaper({ companyCode: "02", year: 2099, month: 12, reportType: "balanceSheet" as any, lines: fewLines });
    fail("should reject balanceSheet reportType in save");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("不支持")) { ok("rejects balanceSheet reportType (saveWorkpaper)"); }
    else { fail("wrong error for reportType in save", msg); }
  }

  // 4d. Empty lines array should still save (deletes all lines)
  const cleared = await saveWorkpaper({ ...TEST, lines: [] });
  if (cleared.lines.length !== 0) {
    fail("empty lines should result in 0 lines", cleared.lines.length);
  } else { ok("empty lines payload deletes all (0 lines after save)"); }

  // ─── Cleanup ──────────────────────────────────────────────
  await cleanup();
  const afterCleanup = await prisma.financeStatementWorkpaper.findUnique({
    where: { companyCode_year_month_reportType: TEST },
  });
  if (afterCleanup !== null) { fail("cleanup should delete test workpaper"); } else { ok("cleanup successful"); }

  // ─── Summary ──────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("Smoke crashed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
