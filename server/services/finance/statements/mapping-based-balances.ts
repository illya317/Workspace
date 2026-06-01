/**
 * M10a: mapping-based leaf balance aggregation
 *
 * 从 mappingPreview 口径出发，只消费叶子科目余额，
 * 通过 effective mapping (nearest-ancestor) 解析每个叶子的 lineCode，
 * 按 lineCode 聚合 debit/credit/net。
 *
 * 不改 generateBalanceSheet，不改 UI，不改 reclass。
 */
import { prisma } from "@/lib/prisma";
import { ensureStatementMappings } from "./mapping/seed-from-config";

// ─── Types ─────────────────────────────────────────────────

export interface LeafAggregation {
  lineCode: string;
  debit: number;
  credit: number;
  net: number;
  accountCodes: string[];
}

export interface UnresolvedAccount {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  net: number;
}

export interface MappingBasedBalancesResult {
  byLineCode: LeafAggregation[];
  unresolved: UnresolvedAccount[];
  leafCount: number;
  resolvedCount: number;
}

// ─── Main ──────────────────────────────────────────────────

export async function aggregateMappingBasedBalances(
  companyCode: string,
  year: number,
  month: number,
  statementType: string = "balance",
): Promise<MappingBasedBalancesResult> {
  // Ensure mappings exist before resolving
  await ensureStatementMappings(companyCode, year, statementType);

  // 1. Find period
  const period = await prisma.financePeriod.findFirst({
    where: { companyCode, year, month },
    select: { id: true },
  });
  if (!period) throw new Error("期间不存在");

  // 2. Load balances with account info
  const balances = await prisma.financeAccountBalance.findMany({
    where: { periodId: period.id },
    include: {
      account: { select: { id: true, code: true, name: true, parentId: true } },
    },
  });

  // 3. Identify leaf accounts (no other account has this as parentId)
  const parentIds = new Set<number>();
  for (const b of balances) {
    if (b.account.parentId != null) parentIds.add(b.account.parentId);
  }
  const leafBalances = balances.filter((b) => !parentIds.has(b.account.id));

  // 4. Preload mappings (batch)
  const mappings = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode, year, statementType },
    select: { accountCode: true, lineCode: true },
  });
  const mappingMap = new Map<string, string>();
  for (const m of mappings) mappingMap.set(m.accountCode, m.lineCode);

  // 5. Preload accounts for parent-chain resolution (batch)
  const accounts = await prisma.financeAccount.findMany({
    where: { companyCode, year },
    select: { code: true, parent: { select: { code: true } } },
  });
  const parentMap = new Map<string, string | null>();
  for (const a of accounts) parentMap.set(a.code, a.parent?.code ?? null);

  // 6. Resolve each leaf's lineCode via effective mapping (in-memory)
  const byLine = new Map<string, { debit: number; credit: number; accountCodes: string[] }>();
  const unresolved: UnresolvedAccount[] = [];

  for (const b of leafBalances) {
    const code = b.account.code;
    const lineCode = resolveLineCode(code, parentMap, mappingMap);

    if (lineCode) {
      const agg = byLine.get(lineCode) || { debit: 0, credit: 0, accountCodes: [] };
      agg.debit += b.closingDebit;
      agg.credit += b.closingCredit;
      agg.accountCodes.push(code);
      byLine.set(lineCode, agg);
    } else {
      unresolved.push({
        accountCode: code,
        accountName: b.account.name,
        debit: b.closingDebit,
        credit: b.closingCredit,
        net: b.closingDebit - b.closingCredit,
      });
    }
  }

  // 7. Build result
  const byLineCode: LeafAggregation[] = [];
  for (const [lineCode, agg] of byLine) {
    byLineCode.push({
      lineCode,
      debit: Math.round(agg.debit * 100) / 100,
      credit: Math.round(agg.credit * 100) / 100,
      net: Math.round((agg.debit - agg.credit) * 100) / 100,
      accountCodes: agg.accountCodes.sort(),
    });
  }

  return {
    byLineCode,
    unresolved: unresolved.sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
    leafCount: leafBalances.length,
    resolvedCount: leafBalances.length - unresolved.length,
  };
}

// ─── In-memory resolver (avoids N+1 DB queries) ───────────

function buildParentChain(
  code: string,
  parentMap: Map<string, string | null>,
): string[] {
  const chain: string[] = [code];
  const parent = parentMap.get(code);
  if (parent) return [...chain, ...buildParentChain(parent, parentMap)];
  // Prefix fallback
  let c = code;
  while (c.length > 1) {
    c = c.slice(0, -1);
    if (c.length > 0) chain.push(c);
  }
  return chain;
}

function resolveLineCode(
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
