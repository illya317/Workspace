/**
 * M11.6 + Phase 2.2: repair script for statement account mappings.
 *
 * Calls ensureStatementMappings() — which backfills missing accountCodes
 * from line config (prefixes + subtractPrefixes) without overwriting
 * existing entries (manual-safe).
 *
 * Also supports --add to apply explicit (accountCode → lineCode)
 * mappings on top of the seed-derived ones. Useful when a top-level
 * account like 1012/1403/1702 has no parent in the line config and
 * needs a hand-written mapping. Source = "manual".
 *
 * Usage:
 *   npx tsx scripts/repair-statement-mappings.ts <companyCode> <year> [more pairs...]
 *     [--type balance|income|cashflow]   # default "balance"
 *     [--all]                            # iterate every (company, year) pair
 *     [--dry-run]                        # compute deltas, do not write
 *     [--add <code>=<line>]              # explicit mapping, repeatable;
 *                                        # applied to every pair in the list
 *
 * Examples:
 *   npx tsx scripts/repair-statement-mappings.ts 02 2025
 *   npx tsx scripts/repair-statement-mappings.ts --all
 *   npx tsx scripts/repair-statement-mappings.ts 01 2024 01 2025 01 2026 \
 *     --add 1012=cash --add 1403=inventory --add 1702=intangible
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { ensureStatementMappings } from "@workspace/finance/server/statements/mapping/seed-from-config";

interface CliOpts {
  companyCode: string | null;
  year: number | null;
  extraPairs: { companyCode: string; year: number }[];
  statementType: string;
  all: boolean;
  dryRun: boolean;
  adds: { accountCode: string; lineCode: string }[];
}

function parseArgs(argv: string[]): CliOpts {
  const args = argv.slice(2);
  let companyCode: string | null = null;
  let year: number | null = null;
  const extraPairs: { companyCode: string; year: number }[] = [];
  let statementType = "balance";
  let all = false;
  let dryRun = false;
  const adds: { accountCode: string; lineCode: string }[] = [];

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--all") all = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--type") statementType = args[++i] ?? "balance";
    else if (a === "--add") {
      const spec = args[++i] ?? "";
      const eq = spec.indexOf("=");
      if (eq <= 0) throw new Error(`--add 需要 <accountCode>=<lineCode> 格式，得到: ${spec}`);
      adds.push({ accountCode: spec.slice(0, eq).trim(), lineCode: spec.slice(eq + 1).trim() });
    } else positional.push(a);
  }

  if (positional.length >= 1) companyCode = positional[0];
  if (positional.length >= 2) {
    const y = parseInt(positional[1], 10);
    if (Number.isNaN(y)) throw new Error(`year 无效: ${positional[1]}`);
    year = y;
  }
  // Additional (company, year) pairs as positional pairs after the first
  for (let i = 2; i + 1 < positional.length; i += 2) {
    const c = positional[i];
    const y = parseInt(positional[i + 1], 10);
    if (Number.isNaN(y)) throw new Error(`year 无效: ${positional[i + 1]}`);
    extraPairs.push({ companyCode: c, year: y });
  }

  if (!all && (!companyCode || year == null)) {
    throw new Error("用法: npx tsx scripts/repair-statement-mappings.ts <companyCode> <year> [more pairs...] [--type ...] [--all] [--dry-run] [--add code=line ...]");
  }
  if (all && (companyCode || year != null || extraPairs.length > 0)) {
    throw new Error("--all 与显式 companyCode/year 互斥");
  }
  return { companyCode, year, extraPairs, statementType, all, dryRun, adds };
}

interface Pair {
  companyCode: string;
  year: number;
}

async function listAllPairs(p: PrismaClient, statementType: string): Promise<Pair[]> {
  // Union of (company, year) pairs present in:
  //   - financeStatementAccountMapping
  //   - financeStatementLineConfig
  //   - financeAccount (for any (company, year) that has account data)
  const fromMappings = await p.financeStatementAccountMapping.findMany({
    where: { statementType },
    select: { companyCode: true, year: true },
    distinct: ["companyCode", "year"],
  });
  const fromLineConfig = await p.financeStatementLineConfig.findMany({
    where: { reportType: "balanceSheet" },
    select: { companyCode: true, year: true },
    distinct: ["companyCode", "year"],
  });
  const fromAccounts = await p.financeAccount.findMany({
    select: { companyCode: true, year: true },
    distinct: ["companyCode", "year"],
  });

  const set = new Map<string, Pair>();
  const add = (c: string | null, y: number) => {
    if (!c) return;
    const k = `${c}:${y}`;
    if (!set.has(k)) set.set(k, { companyCode: c, year: y });
  };
  for (const r of fromMappings) add(r.companyCode, r.year);
  for (const r of fromLineConfig) add(r.companyCode, r.year);
  for (const r of fromAccounts) if (r.year != null) add(r.companyCode, r.year);
  return [...set.values()].sort((a, b) =>
    a.companyCode === b.companyCode ? a.year - b.year : a.companyCode.localeCompare(b.companyCode),
  );
}

async function snapshot(p: PrismaClient, pair: Pair, statementType: string) {
  return p.financeStatementAccountMapping.findMany({
    where: { companyCode: pair.companyCode, year: pair.year, statementType },
    select: { accountCode: true, lineCode: true, source: true },
    orderBy: { accountCode: "asc" },
  });
}

function diff(
  before: { accountCode: string; lineCode: string; source: string }[],
  after: { accountCode: string; lineCode: string; source: string }[],
): { added: typeof after; removed: typeof before } {
  const beforeCodes = new Set(before.map((m) => m.accountCode));
  const afterCodes = new Set(after.map((m) => m.accountCode));
  const added = after.filter((m) => !beforeCodes.has(m.accountCode));
  const removed = before.filter((m) => !afterCodes.has(m.accountCode));
  return { added, removed };
}

async function main() {
  const opts = parseArgs(process.argv);
  const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });

  try {
    let pairs: Pair[];
    if (opts.all) {
      pairs = await listAllPairs(p, opts.statementType);
      console.log(`将扫描 ${pairs.length} 个 (company, year) 组合…\n`);
    } else {
      pairs = [{ companyCode: opts.companyCode!, year: opts.year! }, ...opts.extraPairs];
    }

    let totalCreated = 0;
    let totalBackfilled = 0;
    let totalCopied = 0;
    let totalExisting = 0;
    let totalMigrated = 0;
    let totalManualAdds = 0;
    let pairCount = 0;

    for (const pair of pairs) {
      pairCount++;
      const before = await snapshot(p, pair, opts.statementType);

      if (opts.dryRun) {
        // ensureStatementMappings is idempotent (upsert), so calling it in
        // dry-run mode would still touch the DB. We approximate by computing
        // the desired (accountCode, lineCode) pairs from line config and
        // comparing against the snapshot.
        const lineConfig = await p.financeStatementLineConfig.findMany({
          where: { companyCode: pair.companyCode, year: pair.year, reportType: "balanceSheet", enabled: true },
        });
        const desired = new Map<string, string>(); // accountCode -> lineCode
        for (const lc of lineConfig) {
          const prefixes = JSON.parse(lc.prefixesJson || "[]") as string[];
          const subs = JSON.parse(lc.subtractPrefixesJson || "[]") as string[];
          for (const code of [...prefixes, ...subs]) {
            if (!code) continue;
            desired.set(code, lc.lineCode);
          }
        }
        for (const a of opts.adds) desired.set(a.accountCode, a.lineCode);
        const beforeCodes = new Set(before.map((m) => m.accountCode));
        const wouldAdd = [...desired.entries()].filter(([c]) => !beforeCodes.has(c));
        if (wouldAdd.length > 0) {
          console.log(`[DRY] ${pair.companyCode} ${pair.year}: 现有 ${before.length} / 期望 ${desired.size} / 需补 ${wouldAdd.length}`);
          for (const [code, line] of wouldAdd.slice(0, 5)) {
            console.log(`     + ${code} → ${line}`);
          }
          if (wouldAdd.length > 5) console.log(`     … (省略 ${wouldAdd.length - 5} 条)`);
        } else {
          console.log(`[DRY] ${pair.companyCode} ${pair.year}: 已完整（${before.length}/${desired.size}）`);
        }
        continue;
      }

      const result = await ensureStatementMappings(pair.companyCode, pair.year, opts.statementType);
      let after = await snapshot(p, pair, opts.statementType);

      // Apply --add explicit mappings (source="manual")
      // Always applies to every pair in the list (whether single or --all).
      let manualAdds = 0;
      for (const a of opts.adds) {
        await p.financeStatementAccountMapping.upsert({
          where: { companyCode_year_statementType_accountCode: { companyCode: pair.companyCode, year: pair.year, statementType: opts.statementType, accountCode: a.accountCode } },
          create: { companyCode: pair.companyCode, year: pair.year, statementType: opts.statementType, accountCode: a.accountCode, lineCode: a.lineCode, source: "manual", note: "通过 repair --add 显式指定" },
          update: { lineCode: a.lineCode, source: "manual", note: "通过 repair --add 显式指定" },
        });
        manualAdds++;
      }
      if (manualAdds > 0) {
        after = await snapshot(p, pair, opts.statementType);
      }
      const d = diff(before, after);

      if (d.added.length > 0) {
        console.log(`✓ ${pair.companyCode} ${pair.year}  [${result.source}${manualAdds > 0 ? ` +${manualAdds} manual` : ""}]  +${d.added.length} 条 (${before.length} → ${after.length})`);
        for (const m of d.added) {
          console.log(`     + ${m.accountCode} → ${m.lineCode}  (source=${m.source})`);
        }
      } else {
        console.log(`· ${pair.companyCode} ${pair.year}  [${result.source}]  无变化 (${before.length})`);
      }

      totalCreated += result.created + manualAdds;
      totalManualAdds += manualAdds;
      if (result.source === "backfilled") totalBackfilled++;
      else if (result.source === "copied") totalCopied++;
      else if (result.source === "migrated") totalMigrated++;
      else totalExisting++;
    }

    if (!opts.dryRun) {
      console.log();
      console.log("════════════════════════════════════════");
      console.log(`  扫描:      ${pairCount} 个 (company, year)`);
      console.log(`  累计创建:  ${totalCreated} 条 mapping  (含 manual=${totalManualAdds})`);
      console.log(`  来源统计:  backfilled=${totalBackfilled}  copied=${totalCopied}  migrated=${totalMigrated}  existing=${totalExisting}`);
      console.log("════════════════════════════════════════");
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
