/**
 * Helpers for balance-sheet-diff: in-memory mapping resolver + bucket logic.
 * Extracted to keep the main diff service under the 260-line cap.
 */
import { prisma } from "@workspace/platform/server/prisma";
import type { BalanceSheetLineConfig } from "./config/balance-sheet-lines";
import { resolveMappedLineCode } from "./shared/mapping-resolver";

export interface UnresolvedAccountDetail {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  net: number;
}

export interface UnresolvedGroups {
  /** 1xxx/2xxx/4xxx leaves with abs(debit - credit) > 0.01. Real BS concerns. */
  relevant: UnresolvedAccountDetail[];
  /** 3xxx/5xxx/6xxx leaves with abs(debit - credit) > 0.01. P&L / common — not on BS. */
  ignoredProfitLoss: UnresolvedAccountDetail[];
  /** Any prefix with abs(debit - credit) <= 0.01. Zero-balance noise. */
  zeroBalance: UnresolvedAccountDetail[];
  /** Sum of (debit - credit) for 1xxx entries in `relevant` — potential asset impact. */
  relevantAssetNet: number;
  /** Sum of (debit - credit) for 2xxx/4xxx entries in `relevant` — potential L+E impact. */
  relevantLiabEquityNet: number;
}

/**
 * M11.7: bucket unresolved leaves by likely BS relevance.
 *
 *   relevant            1xxx/2xxx/4xxx AND abs(net) > 0.01   → real BS concerns
 *   ignoredProfitLoss   3xxx/5xxx/6xxx AND abs(net) > 0.01   → P&L / common, off-BS
 *   zeroBalance         any prefix AND abs(net) <= 0.01      → noise
 *
 * `relevant` is further split by 1xxx vs 2xxx/4xxx so callers can
 * estimate asset-side vs L+E-side balance gap impact.
 */
export function classifyUnresolved(
  unresolved: UnresolvedAccountDetail[],
): UnresolvedGroups {
  const relevant: UnresolvedAccountDetail[] = [];
  const ignoredProfitLoss: UnresolvedAccountDetail[] = [];
  const zeroBalance: UnresolvedAccountDetail[] = [];
  let relevantAssetNet = 0;
  let relevantLiabEquityNet = 0;

  for (const u of unresolved) {
    if (Math.abs(u.net) <= 0.01) {
      zeroBalance.push(u);
      continue;
    }
    const firstDigit = u.accountCode.slice(0, 1);
    if (firstDigit === "1" || firstDigit === "2" || firstDigit === "4") {
      relevant.push(u);
      if (firstDigit === "1") relevantAssetNet += u.net;
      else relevantLiabEquityNet += u.net;
    } else {
      ignoredProfitLoss.push(u);
    }
  }

  const sortByCode = (a: UnresolvedAccountDetail, b: UnresolvedAccountDetail) =>
    a.accountCode.localeCompare(b.accountCode);
  relevant.sort(sortByCode);
  ignoredProfitLoss.sort(sortByCode);
  zeroBalance.sort(sortByCode);

  return {
    relevant,
    ignoredProfitLoss,
    zeroBalance,
    relevantAssetNet: +relevantAssetNet.toFixed(2),
    relevantLiabEquityNet: +relevantLiabEquityNet.toFixed(2),
  };
}

/**
 * Re-derive which leaf account codes contributed to each mappingByLine
 * entry. Walks every account in the period, resolves it to a lineCode via
 * the same parent-chain logic as the main mapping resolver, and returns
 * the per-lineCode list.
 */
export async function aggregateMappedAccountCodes(
  mappingByLine: Map<string, { debit: number; credit: number }>,
  config: BalanceSheetLineConfig[],
  companyCode: string,
  year: number,
): Promise<Array<[string, string[]]>> {
  const mappings = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode, year, statementType: "balance" },
    select: { accountCode: true, lineCode: true },
  });
  const mappingMap = new Map<string, string>();
  for (const m of mappings) mappingMap.set(m.accountCode, m.lineCode);

  const accounts = await prisma.financeAccount.findMany({
    where: { companyCode, year },
    select: { code: true, parent: { select: { code: true } } },
  });
  const parentMap = new Map<string, string | null>();
  for (const a of accounts) parentMap.set(a.code, a.parent?.code ?? null);

  const allCodesToLine = new Map<string, string[]>();
  for (const code of parentMap.keys()) {
    const line = resolveMappedLineCode(code, parentMap, mappingMap);
    if (line && mappingByLine.has(line)) {
      const arr = allCodesToLine.get(line) || [];
      arr.push(code);
      allCodesToLine.set(line, arr);
    }
  }
  return config
    .filter((l) => allCodesToLine.has(l.lineCode))
    .map((l) => [l.lineCode, (allCodesToLine.get(l.lineCode) || []).sort()] as [string, string[]]);
}

/**
 * Bucket unresolved accounts by the legacy `line.prefixes` they would have
 * matched. Used to surface "this line is missing N leaves that the legacy
 * path would have included but the mapping couldn't resolve".
 */
export function bucketUnresolvedByLegacyPrefix(
  unresolved: { accountCode: string }[],
  config: BalanceSheetLineConfig[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const u of unresolved) {
    for (const line of config) {
      const prefixes = line.prefixes || [];
      if (prefixes.some((p) => u.accountCode.startsWith(p))) {
        const arr = out.get(line.lineCode) || [];
        arr.push(u.accountCode);
        out.set(line.lineCode, arr);
        break;
      }
    }
  }
  return out;
}
