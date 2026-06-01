/**
 * M11.5 verification CLI: line-level diff between legacy prefixes and
 * mapping-based balance sheet compute, plus reclass additions/deductions
 * and account counts.
 *
 * Usage:
 *   npx tsx scripts/balance-sheet-diff.ts <companyCode> <year> <month>
 *     [--no-mapping]              # legacy-only diff
 *     [--json]                    # emit machine-readable JSON instead of text
 *     [--json-out <path>]         # also write JSON to file
 *     [--top <n>]                 # show only top N diff lines (default 30)
 *
 * Examples:
 *   npx tsx scripts/balance-sheet-diff.ts 02 2025 2
 *   npx tsx scripts/balance-sheet-diff.ts 02 2025 2 --json
 *   npx tsx scripts/balance-sheet-diff.ts 02 2025 2 --no-mapping
 */
import "dotenv/config";
import * as fs from "fs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { computeBalanceSheetDiff } from "../server/services/finance/statements/balance-sheet-diff";

function parseArgs(argv: string[]): {
  companyCode: string;
  year: number;
  month: number;
  withMapping: boolean;
  json: boolean;
  jsonOut: string | null;
  top: number;
} {
  const args = argv.slice(2);
  if (args.length < 3) {
    throw new Error("用法: npx tsx scripts/balance-sheet-diff.ts <companyCode> <year> <month> [--no-mapping] [--json] [--json-out <path>] [--top <n>]");
  }
  const companyCode = args[0];
  const year = parseInt(args[1], 10);
  const month = parseInt(args[2], 10);
  if (!companyCode || Number.isNaN(year) || Number.isNaN(month)) {
    throw new Error("companyCode/year/month 都是必填");
  }

  let withMapping = true;
  let json = false;
  let jsonOut: string | null = null;
  let top = 30;
  for (let i = 3; i < args.length; i++) {
    const a = args[i];
    if (a === "--no-mapping") withMapping = false;
    else if (a === "--json") json = true;
    else if (a === "--json-out") { jsonOut = args[++i] ?? null; }
    else if (a === "--top") { top = parseInt(args[++i] ?? "30", 10); }
  }
  return { companyCode, year, month, withMapping, json, jsonOut, top };
}

function fmt(n: number): string {
  if (Math.abs(n) < 0.005) return "0.00";
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pad(s: string, n: number, alignRight = false): string {
  if (s.length >= n) return s.slice(0, n);
  const padding = " ".repeat(n - s.length);
  return alignRight ? padding + s : s + padding;
}

function printTextReport(
  result: Awaited<ReturnType<typeof computeBalanceSheetDiff>>,
  top: number,
): void {
  const { period, config, lines, totals, diagnostics, meta } = result;
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`  资产负债表 diff — ${period.companyCode ?? "(无公司)"} ${period.year}/${period.month}`);
  console.log("══════════════════════════════════════════════════════════════════\n");
  console.log(`  配置来源:   ${config.usedDbConfig ? "DB" : "TS 默认"}  (${config.lineCount} 行)`);
  console.log(`  叶子科目:   ${meta.totalLeafCount}  解析成功 ${meta.resolvedCount}  未解析 ${meta.unresolvedCount}`);
  console.log(`  重分类条目: ${meta.reclassEntryCount}  解析成功 ${meta.reclassResolvedCount}  未解析 ${meta.reclassUnresolvedCount}\n`);

  console.log("  ── 总额校验 ──");
  console.log(`  legacy:  资产 ${fmt(totals.legacyAssets).padStart(18)}  负债+权益 ${fmt(totals.legacyLiabilitiesAndEquity).padStart(18)}  差额 ${fmt(totals.legacyBalanceGap).padStart(14)}`);
  console.log(`  mapping: 资产 ${fmt(totals.mappingAssets).padStart(18)}  负债+权益 ${fmt(totals.mappingLiabilitiesAndEquity).padStart(18)}  差额 ${fmt(totals.mappingBalanceGap).padStart(14)}\n`);

  // M12: MAPPING_OK / MAPPING_GAP marker (machine-greppable)
  //   MAPPING_OK  ⇔  |mappingBalanceGap| < 0.01  AND  relevant.length === 0
  //   MAPPING_GAP otherwise; emit reason lines
  if (result.unresolvedGroups) {
    const relevantCount = result.unresolvedGroups.relevant.length;
    const gap = Math.abs(totals.mappingBalanceGap);
    const ok = gap < 0.01 && relevantCount === 0;
    console.log(`  ── 状态：${ok ? "MAPPING_OK ✅" : "MAPPING_GAP ❌"} ──`);
    if (!ok) {
      if (gap >= 0.01) console.log(`    mapping balance gap = ${fmt(totals.mappingBalanceGap)}`);
      if (relevantCount > 0) console.log(`    unresolved relevant = ${relevantCount} (1xxx/2xxx/4xxx 非零)`);
    } else {
      console.log(`    balance gap = 0, relevant = 0`);
    }
    console.log();
  }

  // Sort lines by absolute diff desc for the top table
  const ranked = [...lines]
    .filter((l) => !l.isHeader && !l.isTotal && !l.isGrandTotal)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const topN = ranked.slice(0, top);
  const nonZero = ranked.filter((l) => Math.abs(l.diff) >= 0.01);

  console.log(`  ── diff 排序（绝对值 Top ${topN.length}，共 ${nonZero.length} 行非零）──`);
  const hdr = `  ${pad("lineCode", 24)} ${pad("section", 22)} ${pad("legacy", 16, true)} ${pad("mapping", 16, true)} ${pad("diff", 16, true)} ${pad("M#", 4, true)} ${pad("U#", 4, true)}  reclassA/reclassD`;
  console.log(hdr);
  console.log("  " + "─".repeat(hdr.length - 2));
  for (const l of topN) {
    const rA = `+${fmt(l.reclassAdditions.credit)}c`;
    const rD = `-${fmt(l.reclassDeductions.credit)}c`;
    const reclass = l.reclassAdditions.credit || l.reclassDeductions.credit || l.reclassAdditions.debit || l.reclassDeductions.debit
      ? `${rA}/${rD}`
      : "—";
    console.log(
      `  ${pad(l.lineCode, 24)} ${pad(l.section, 22)} ${pad(fmt(l.legacyAmount), 16, true)} ${pad(fmt(l.mappingAmount), 16, true)} ${pad(fmt(l.diff), 16, true)} ${pad(String(l.mappedAccountCount), 4, true)} ${pad(String(l.unresolvedAccountCount), 4, true)}  ${reclass}`,
    );
  }
  if (nonZero.length > topN.length) {
    console.log(`  … (省略 ${nonZero.length - topN.length} 行)`);
  }

  // Show lines with reclass routed (reclassA or reclassD != 0)
  const reclassLines = lines.filter((l) =>
    l.reclassAdditions.credit || l.reclassAdditions.debit ||
    l.reclassDeductions.credit || l.reclassDeductions.debit,
  );
  if (reclassLines.length > 0) {
    console.log(`\n  ── 有 reclass 路由的行 (${reclassLines.length}) ──`);
    for (const l of reclassLines) {
      const parts: string[] = [];
      if (l.reclassAdditions.credit) parts.push(`A.credit=${fmt(l.reclassAdditions.credit)}`);
      if (l.reclassAdditions.debit) parts.push(`A.debit=${fmt(l.reclassAdditions.debit)}`);
      if (l.reclassDeductions.credit) parts.push(`D.credit=${fmt(l.reclassDeductions.credit)}`);
      if (l.reclassDeductions.debit) parts.push(`D.debit=${fmt(l.reclassDeductions.debit)}`);
      console.log(`  ${l.lineCode.padEnd(24)} ${parts.join(", ")}`);
    }
  }

  // Show unresolved accounts (M11.7 grouping)
  const groups = result.unresolvedGroups;
  if (groups) {
    const total = groups.relevant.length + groups.ignoredProfitLoss.length + groups.zeroBalance.length;
    console.log(`\n  ── 未解析叶子 (${total})：relevant=${groups.relevant.length}  ignored(P&L)=${groups.ignoredProfitLoss.length}  zeroBalance=${groups.zeroBalance.length} ──`);
    if (groups.relevant.length > 0) {
      console.log(`  relevant (1xxx/2xxx/4xxx 非零) — 资产净额 ${fmt(groups.relevantAssetNet)}，负债+权益净额 ${fmt(groups.relevantLiabEquityNet)}：`);
      for (const u of groups.relevant) {
        const side = u.accountCode.startsWith("1") ? "1xxx" : u.accountCode.startsWith("2") ? "2xxx" : "4xxx";
        console.log(`    ${u.accountCode.padEnd(10)} ${side}  net=${fmt(u.net).padStart(16)}  ${u.accountName}`);
      }
    } else {
      console.log(`  relevant: 无 (1xxx/2xxx/4xxx 全部已映射或余额为 0)`);
    }
    if (groups.ignoredProfitLoss.length > 0) {
      console.log(`  ignored (3xxx/5xxx/6xxx 非零，P&L / 共同类) — ${groups.ignoredProfitLoss.length} 个：`);
      const byPrefix = new Map<string, number>();
      let pnlNet = 0;
      for (const u of groups.ignoredProfitLoss) {
        const k = u.accountCode.slice(0, 2);
        byPrefix.set(k, (byPrefix.get(k) || 0) + 1);
        pnlNet += u.net;
      }
      for (const [k, n] of [...byPrefix.entries()].sort()) {
        console.log(`    ${k}: ${n}`);
      }
      console.log(`    合计净额 ${fmt(pnlNet)} (不计入资产负债表)`);
    }
    if (groups.zeroBalance.length > 0) {
      console.log(`  zeroBalance — ${groups.zeroBalance.length} 个科目 abs(debit-credit) <= 0.01，无金额影响`);
    }
  } else if (meta.unresolvedCount > 0) {
    // legacy-only mode: fall back to the flat prefix histogram
    const groupByPrefix = new Map<string, number>();
    for (const c of meta.unresolvedAccountCodes) {
      const k = c.slice(0, 2);
      groupByPrefix.set(k, (groupByPrefix.get(k) || 0) + 1);
    }
    console.log(`\n  ── 未解析叶子 (${meta.unresolvedCount})，按 2 位前缀分组 ──`);
    for (const [k, n] of [...groupByPrefix.entries()].sort()) {
      const samples = meta.unresolvedAccountCodes.filter((c) => c.startsWith(k)).slice(0, 5).join(", ");
      console.log(`    ${k}: ${n} (e.g. ${samples})`);
    }
  }

  if (diagnostics.mapping.length > 0) {
    console.log(`\n  ── mapping diagnostics (${diagnostics.mapping.length}) ──`);
    for (const d of diagnostics.mapping.slice(0, 20)) console.log(`  · ${d}`);
    if (diagnostics.mapping.length > 20) console.log(`  … (省略 ${diagnostics.mapping.length - 20} 条)`);
  }
  if (diagnostics.legacy.length > 0) {
    console.log(`\n  ── legacy diagnostics (${diagnostics.legacy.length}) ──`);
    for (const d of diagnostics.legacy.slice(0, 20)) console.log(`  · ${d}`);
    if (diagnostics.legacy.length > 20) console.log(`  … (省略 ${diagnostics.legacy.length - 20} 条)`);
  }

  console.log();
}

async function main() {
  const opts = parseArgs(process.argv);
  const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });
  try {
    const result = await computeBalanceSheetDiff({
      companyCode: opts.companyCode,
      year: opts.year,
      month: opts.month,
      withMapping: opts.withMapping,
    });
    if (opts.json) {
      const json = JSON.stringify(result, null, 2);
      console.log(json);
    } else {
      printTextReport(result, opts.top);
    }
    if (opts.jsonOut) {
      fs.writeFileSync(opts.jsonOut, JSON.stringify(result, null, 2));
      console.log(`(JSON written to ${opts.jsonOut})`);
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
