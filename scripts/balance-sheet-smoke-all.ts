/**
 * Phase 2.1: 全公司全年度资产负债表 smoke.
 *
 * Scans every (companyCode, year) pair that has a FinancePeriod, runs
 * the mapping balance check on the latest month of that year, and
 * prints one line per period:
 *
 *   company year month status       gap               relevant  ignored  zero
 *   02      2025 2     MAPPING_OK         0.00          0         0        607
 *   02      2025 1     MAPPING_GAP    12,345.67        2         0        605
 *
 * Read-only — does not touch DB or modify the compute. GAP rows print
 * up to 5 top diff lines and up to 5 relevant unresolved accounts
 * underneath the table for at-a-glance triage.
 *
 * Usage:
 *   npm run finance:bs-smoke:all
 *   npx tsx scripts/balance-sheet-smoke-all.ts [--verbose]
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { requireDatabasePath } from "./lib/database-url.js";
import { computeBalanceSheetDiff } from "@workspace/finance/server/statements/balance-sheet-diff";

interface PeriodRow {
  companyCode: string;
  year: number;
  month: number;
}

function fmt(n: number): string {
  if (Math.abs(n) < 0.005) return "0.00";
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function listLatestPeriods(p: PrismaClient): Promise<PeriodRow[]> {
  const all = await p.financePeriod.findMany({
    select: { companyCode: true, year: true, month: true },
    orderBy: [{ companyCode: "asc" }, { year: "asc" }, { month: "asc" }],
  });
  const map = new Map<string, PeriodRow>();
  for (const r of all) {
    if (!r.companyCode) continue;
    const key = `${r.companyCode}:${r.year}`;
    const cur = map.get(key);
    if (!cur || r.month > cur.month) {
      map.set(key, { companyCode: r.companyCode, year: r.year, month: r.month });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.companyCode === b.companyCode ? a.year - b.year : a.companyCode.localeCompare(b.companyCode),
  );
}

function row(label: string, w: number, right = false): string {
  if (label.length >= w) return label.slice(0, w);
  const pad = " ".repeat(w - label.length);
  return right ? pad + label : label + pad;
}

async function main() {
  const verbose = process.argv.includes("--verbose");
  const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: requireDatabasePath() }) });
  try {
    const periods = await listLatestPeriods(p);
    if (periods.length === 0) {
      console.log("没有找到任何 FinancePeriod。");
      return;
    }
    console.log(`扫描 ${periods.length} 个 (company, year) 最新月...\n`);

    // Header
    const cols = [
      row("company", 10),
      row("year", 6, true),
      row("month", 7, true),
      row("status", 14),
      row("gap", 20, true),
      row("relevant", 10, true),
      row("ignored", 10, true),
      row("zero", 8, true),
    ];
    console.log("  " + cols.join(" "));
    console.log("  " + "─".repeat(cols.join(" ").length));

    let okCount = 0;
    let gapCount = 0;
    let errCount = 0;
    const gapRows: { period: PeriodRow; result: Awaited<ReturnType<typeof computeBalanceSheetDiff>> }[] = [];

    for (const period of periods) {
      try {
        const result = await computeBalanceSheetDiff({
          companyCode: period.companyCode,
          year: period.year,
          month: period.month,
        });
        const gap = result.totals.mappingBalanceGap;
        const groups = result.unresolvedGroups;
        const relevantCount = groups?.relevant.length ?? 0;
        const ignoredCount = groups?.ignoredProfitLoss.length ?? 0;
        const zeroCount = groups?.zeroBalance.length ?? 0;
        // FP rounding toFixed(2) can yield ±0.01; treat up to that as OK
        const isOk = Math.abs(gap) <= 0.01 && relevantCount === 0;
        const status = isOk ? "MAPPING_OK ✅" : "MAPPING_GAP ❌";
        if (isOk) okCount++; else { gapCount++; gapRows.push({ period, result }); }

        console.log("  " + [
          row(period.companyCode, 10),
          row(String(period.year), 6, true),
          row(String(period.month), 7, true),
          row(status, 14),
          row(fmt(gap), 20, true),
          row(String(relevantCount), 10, true),
          row(String(ignoredCount), 10, true),
          row(String(zeroCount), 8, true),
        ].join(" "));
      } catch (e) {
        errCount++;
        console.log("  " + [
          row(period.companyCode, 10),
          row(String(period.year), 6, true),
          row(String(period.month), 7, true),
          row("ERROR", 14),
          row((e as Error).message.slice(0, 40), 40),
        ].join(" "));
      }
    }

    console.log("\n" + "═".repeat(85));
    console.log(`  扫描: ${periods.length}  OK: ${okCount}  GAP: ${gapCount}  ERROR: ${errCount}`);

    if (gapCount > 0) {
      console.log("\n  ── GAP 详情 ──");
      for (const { period, result } of gapRows) {
        const groups = result.unresolvedGroups!;
        const gap = result.totals.mappingBalanceGap;
        const residuals = result.meta.residualParents;
        console.log(`\n  [${period.companyCode} ${period.year}/${period.month}]  gap=${fmt(gap)}  relevant=${groups.relevant.length}`);
        if (residuals.length > 0) {
          console.log(`    residual parents (${residuals.length}):`);
          for (const r of residuals) {
            const res = (r.residualDebit - r.residualCredit).toFixed(2);
            console.log(`      ${r.accountCode.padEnd(10)} ${r.lineCode.padEnd(24)}  own=${(r.residualDebit + r.residualCredit).toFixed(2)}  residual=${res}  ${r.accountName}`);
          }
        }
        // Top 5 diff lines (only non-header/total/grandTotal)
        const top = [...result.lines]
          .filter((l) => !l.isHeader && !l.isTotal && !l.isGrandTotal)
          .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
          .filter((l) => Math.abs(l.diff) >= 0.01)
          .slice(0, 5);
        if (top.length > 0) {
          console.log(`    top diff:`);
          for (const l of top) {
            console.log(`      ${row(l.lineCode, 24)}  legacy=${fmt(l.legacyAmount).padStart(16)}  mapping=${fmt(l.mappingAmount).padStart(16)}  diff=${fmt(l.diff).padStart(16)}`);
          }
        }
        if (groups.relevant.length > 0) {
          console.log(`    relevant unresolved:`);
          for (const u of groups.relevant.slice(0, 5)) {
            console.log(`      ${u.accountCode.padEnd(10)} net=${fmt(u.net).padStart(16)}  ${u.accountName}`);
          }
          if (groups.relevant.length > 5) {
            console.log(`      … (省略 ${groups.relevant.length - 5} 条)`);
          }
        }
        if (verbose) {
          const diagnostics = result.diagnostics.mapping.filter((d) => d.includes("重分类"));
          if (diagnostics.length > 0) {
            console.log(`    reclass diagnostics:`);
            for (const d of diagnostics.slice(0, 5)) console.log(`      · ${d}`);
            if (diagnostics.length > 5) console.log(`      … (省略 ${diagnostics.length - 5} 条)`);
          }
        }
      }
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
