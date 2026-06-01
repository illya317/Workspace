/** M11.5: line-level diff between legacy prefixes and mapping-based balance sheet compute. Read-only diagnostic. */
import { prisma } from "@/lib/prisma";
import type { BalanceItem, ReclassEntry, ReportPeriod } from "./report-helpers";
import { reclassifyFromEntries } from "./report-helpers";
import type { BalanceSheetLineConfig } from "./config/balance-sheet-lines";
import { loadBalanceSheetConfig } from "./config/load-config";
import { computeBalanceSheet } from "./compute-balance-sheet";
import { aggregateMappingBasedBalances } from "./mapping-based-balances";
import { resolveReclassEntriesToLines } from "./mapping/reclass-routing";
import {
  aggregateMappedAccountCodes,
  bucketUnresolvedByLegacyPrefix,
  classifyUnresolved,
} from "./balance-sheet-diff-helpers";
import type { UnresolvedGroups } from "./balance-sheet-diff-helpers";

export interface BalanceSheetDiffParams {
  companyCode: string;
  year: number;
  month: number;
  /** When false, skip the mapping-mode compute (legacy-only). Default true. */
  withMapping?: boolean;
}

export interface LineDiff {
  lineCode: string;
  label: string;
  section: string;
  side: "debit" | "credit";
  isHeader: boolean;
  isTotal: boolean;
  isGrandTotal: boolean;
  legacyAmount: number;
  mappingAmount: number;
  diff: number;
  /** Leaf accounts that the mapping resolver routed to this lineCode. */
  mappedAccountCount: number;
  mappedAccountCodes: string[];
  /**
   * Leaf accounts whose lineCode could not be resolved, bucketed here
   * because their code starts with one of this line's `prefixes` (legacy match).
   */
  unresolvedAccountCount: number;
  unresolvedAccountCodes: string[];
  /** M11 reclass additions routed to this lineCode. */
  reclassAdditions: { debit: number; credit: number };
  /** M11 reclass deductions routed to this lineCode. */
  reclassDeductions: { debit: number; credit: number };
}

export interface BalanceSheetDiffResult {
  period: ReportPeriod;
  config: {
    usedDbConfig: boolean;
    lineCount: number;
  };
  lines: LineDiff[];
  totals: {
    legacyAssets: number;
    mappingAssets: number;
    legacyLiabilitiesAndEquity: number;
    mappingLiabilitiesAndEquity: number;
    /** mappingAssets - (mappingLiabilities + mappingEquity); 0 means balanced. */
    mappingBalanceGap: number;
    /** legacyAssets - (legacyLiabilities + legacyEquity); 0 means balanced. */
    legacyBalanceGap: number;
  };
  diagnostics: {
    legacy: string[];
    mapping: string[];
  };
  meta: {
    totalLeafCount: number;
    resolvedCount: number;
    unresolvedCount: number;
    unresolvedAccountCodes: string[];
    reclassEntryCount: number;
    reclassResolvedCount: number;
    reclassUnresolvedCount: number;
  };
  /**
   * M11.7: unresolved leaves bucketed by likely relevance to the balance sheet.
   * Only populated when withMapping is true.
   */
  unresolvedGroups?: UnresolvedGroups;
}

export async function computeBalanceSheetDiff(
  params: BalanceSheetDiffParams,
): Promise<BalanceSheetDiffResult> {
  const withMapping = params.withMapping !== false;

  // ─── 1. Period + balances + reclass entries (read-only) ───
  const period = await prisma.financePeriod.findFirst({
    where: { companyCode: params.companyCode, year: params.year, month: params.month },
  });
  if (!period) {
    throw new Error(`期间不存在: ${params.companyCode} ${params.year}/${params.month}`);
  }

  const dbBalances = await prisma.financeAccountBalance.findMany({
    where: { periodId: period.id },
    include: { account: { select: { code: true, name: true } } },
    orderBy: { account: { code: "asc" } },
  });
  const balances: BalanceItem[] = dbBalances.map((b) => ({
    account: { code: b.account.code, name: b.account.name },
    openingDebit: b.openingDebit,
    openingCredit: b.openingCredit,
    closingDebit: b.closingDebit,
    closingCredit: b.closingCredit,
    currentDebit: b.currentDebit,
    currentCredit: b.currentCredit,
  }));

  const voucherRows = await prisma.reclassResult.findMany({
    where: { periodId: period.id, status: { in: ["approved", "adjusted"] } },
    select: { sourceAccount: true, targetAccount: true, amount: true },
  });
  const balanceRows = await prisma.financeBalanceReclassAdjustment.findMany({
    where: { periodId: period.id, status: { in: ["approved", "adjusted"] } },
    select: { sourceAccountCode: true, targetAccountCode: true, amount: true },
  });
  const reclassEntries: ReclassEntry[] = [
    ...voucherRows.map((r) => ({
      sourceAccount: r.sourceAccount,
      targetAccount: r.targetAccount,
      amount: r.amount,
    })),
    ...balanceRows.map((r) => ({
      sourceAccount: r.sourceAccountCode,
      targetAccount: r.targetAccountCode,
      amount: r.amount,
    })),
  ];

  // ─── 2. Config (DB-loaded) ───
  const config = await loadBalanceSheetConfig(params.companyCode, params.year);
  // usedDbConfig is implicit when the DB row count > 0; the loader's first
  // branch returns the DB rows directly. We mark true if any DB row exists.
  const dbCount = await prisma.financeStatementLineConfig.count({
    where: { companyCode: params.companyCode, year: params.year, reportType: "balanceSheet" },
  });

  // ─── 3. Legacy compute (no mapping, no lineCode reclass) ───
  const reclass = reclassifyFromEntries(reclassEntries);
  const legacyResult = computeBalanceSheet(config, balances, reclass, undefined, undefined);

  // ─── 4. Mapping compute (mappingByLine + reclassByLine) ───
  let mappingByLine: Map<string, { debit: number; credit: number }> | undefined;
  let unresolvedAccounts: { accountCode: string; accountName: string; debit: number; credit: number; net: number }[] = [];
  let aggResolvedCount = 0;
  let aggLeafCount = 0;
  let reclassByLine: Awaited<ReturnType<typeof resolveReclassEntriesToLines>> | undefined;
  let mappingDiagnostics: string[] = [];
  let mappingLines: { lineCode: string; amount: number }[] = [];

  if (withMapping) {
    const agg = await aggregateMappingBasedBalances(params.companyCode, params.year, params.month, "balance");
    aggLeafCount = agg.leafCount;
    aggResolvedCount = agg.resolvedCount;
    unresolvedAccounts = agg.unresolved;
    mappingByLine = new Map(
      agg.byLineCode.map((l) => [l.lineCode, { debit: l.debit, credit: l.credit }]),
    );
    reclassByLine = await resolveReclassEntriesToLines(params.companyCode, params.year, reclassEntries);
    const mappingResult = computeBalanceSheet(config, balances, reclass, mappingByLine, reclassByLine);
    mappingLines = mappingResult.lines.map((l) => ({ lineCode: l.lineCode, amount: l.amount }));
    mappingDiagnostics = [
      ...mappingResult.diagnostics,
      ...reclassByLine.unresolved.map((u) =>
        `重分类${u.reason === "noSourceLine" ? "源" : "目标"}科目 ${u.entry.sourceAccount}→${u.entry.targetAccount} (${u.entry.amount}) 无法解析到报表行，已跳过`,
      ),
    ];
  }

  // ─── 5. Build per-line diffs ───
  const mappedByLine = new Map<string, string[]>();
  if (mappingByLine) {
    const entries = await aggregateMappedAccountCodes(mappingByLine, config, params.companyCode, params.year);
    for (const [lineCode, codeList] of entries) {
      mappedByLine.set(lineCode, codeList);
    }
  }
  // Pre-bucket unresolved accounts by legacy prefix match
  const unresolvedByLine = bucketUnresolvedByLegacyPrefix(unresolvedAccounts, config);

  const legacyByLine = new Map(legacyResult.lines.map((l) => [l.lineCode, l.amount]));

  const diffs: LineDiff[] = config.map((line) => {
    const mappedCodes = mappedByLine.get(line.lineCode) || [];
    const unresolvedCodes = unresolvedByLine.get(line.lineCode) || [];
    const d = reclassByLine?.deductionsByLine.get(line.lineCode) || { debit: 0, credit: 0 };
    const a = reclassByLine?.additionsByLine.get(line.lineCode) || { debit: 0, credit: 0 };
    const legacyAmount = legacyByLine.get(line.lineCode) || 0;
    const mappingAmount = mappingLines.find((l) => l.lineCode === line.lineCode)?.amount ?? 0;
    return {
      lineCode: line.lineCode,
      label: line.label,
      section: line.section,
      side: line.side,
      isHeader: !!line.isHeader,
      isTotal: !!line.isTotal,
      isGrandTotal: !!line.isGrandTotal,
      legacyAmount,
      mappingAmount,
      diff: +(mappingAmount - legacyAmount).toFixed(2),
      mappedAccountCount: mappedCodes.length,
      mappedAccountCodes: mappedCodes,
      unresolvedAccountCount: unresolvedCodes.length,
      unresolvedAccountCodes: unresolvedCodes,
      reclassAdditions: a,
      reclassDeductions: d,
    };
  });

  // ─── 6. Totals + balance check ───
  const sumSide = (side: "debit" | "credit", source: "legacy" | "mapping") => {
    const get = (l: LineDiff) => (source === "legacy" ? l.legacyAmount : l.mappingAmount);
    return diffs
      .filter((l) => !l.isHeader && !l.isTotal && !l.isGrandTotal && l.side === side)
      .reduce((s, l) => s + get(l), 0);
  };
  const round2 = (n: number) => +n.toFixed(2);
  const legacyAssets = round2(sumSide("debit", "legacy"));
  const mappingAssets = round2(sumSide("debit", "mapping"));
  const legacyLE = round2(sumSide("credit", "legacy"));
  const mappingLE = round2(sumSide("credit", "mapping"));

  return {
    period: { id: period.id, companyCode: period.companyCode, year: period.year, month: period.month },
    config: { usedDbConfig: dbCount > 0, lineCount: config.length },
    lines: diffs,
    totals: {
      legacyAssets,
      mappingAssets,
      legacyLiabilitiesAndEquity: legacyLE,
      mappingLiabilitiesAndEquity: mappingLE,
      legacyBalanceGap: round2(legacyAssets - legacyLE),
      mappingBalanceGap: round2(mappingAssets - mappingLE),
    },
    diagnostics: { legacy: legacyResult.diagnostics, mapping: mappingDiagnostics },
    meta: {
      totalLeafCount: aggLeafCount,
      resolvedCount: aggResolvedCount,
      unresolvedCount: unresolvedAccounts.length,
      unresolvedAccountCodes: unresolvedAccounts.map((u) => u.accountCode).sort(),
      reclassEntryCount: reclassEntries.length,
      reclassResolvedCount: reclassEntries.length - (reclassByLine?.unresolved.length ?? 0),
      reclassUnresolvedCount: reclassByLine?.unresolved.length ?? 0,
    },
    unresolvedGroups: withMapping ? classifyUnresolved(unresolvedAccounts) : undefined,
  };
}

// ─── Helpers ───────────────────────────────────────────────
// in-memory resolver, bucket logic, and M11.7 classifier live in
// balance-sheet-diff-helpers.ts
