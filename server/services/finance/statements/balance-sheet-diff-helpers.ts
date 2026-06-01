/**
 * Helpers for balance-sheet-diff: in-memory mapping resolver + bucket logic.
 * Extracted to keep the main diff service under the 260-line cap.
 */
import { prisma } from "@/lib/prisma";
import type { BalanceSheetLineConfig } from "./config/balance-sheet-lines";

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
    const line = resolveInMemory(code, parentMap, mappingMap);
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

function buildParentChain(
  code: string,
  parentMap: Map<string, string | null>,
): string[] {
  const chain: string[] = [code];
  const parent = parentMap.get(code);
  if (parent) return [...chain, ...buildParentChain(parent, parentMap)];
  let c = code;
  while (c.length > 1) {
    c = c.slice(0, -1);
    if (c.length > 0) chain.push(c);
  }
  return chain;
}

function resolveInMemory(
  accountCode: string,
  parentMap: Map<string, string | null>,
  mappingMap: Map<string, string>,
): string | null {
  const chain = buildParentChain(accountCode, parentMap);
  for (const code of chain) {
    const line = mappingMap.get(code);
    if (line) return line;
  }
  return null;
}
