/**
 * M10a + Phase 2.3B: mapping-based balance aggregation with residual leaf.
 *
 * Aggregation口径：
 *   对每个 account node 计算 residual = own_balance - direct_children_balance_sum
 *   若 abs(residual) > 0.01, 该 node 的 residual 视为有效余额，参与 mapping 聚合。
 *   真正叶子 (无 children) 的 residual = own_balance，与原 leaf-only 行为一致。
 *   若 parent 余额完全等于 children 汇总, residual=0, 不重复计入。
 *   若 parent 有余额而 children 全 0, parent 自身余额代表有效余额, 纳入。
 *
 * 不改 generateBalanceSheet, 不改 UI, 不改 reclass。
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

/** Parent node whose own balance was not fully explained by its children. */
export interface ResidualParent {
  accountCode: string;
  accountName: string;
  lineCode: string;
  residualDebit: number;
  residualCredit: number;
  ownDebit: number;
  ownCredit: number;
  childrenDebit: number;
  childrenCredit: number;
}

export interface MappingBasedBalancesResult {
  byLineCode: LeafAggregation[];
  unresolved: UnresolvedAccount[];
  /** Number of balance-bearing nodes (leaf + residual parent) that contributed. */
  balanceBearingCount: number;
  /** Total nodes examined (all balance rows in the period). */
  totalAccountCount: number;
  resolvedCount: number;
  /** Phase 2.3B diagnostics: parents that contributed residual. */
  residualParents: ResidualParent[];
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

  // 3. Index balances by accountCode (own balance) and by id
  const ownByCode = new Map<string, { code: string; name: string; debit: number; credit: number; parentId: number | null; id: number }>();
  for (const b of balances) {
    ownByCode.set(b.account.code, {
      code: b.account.code,
      name: b.account.name,
      debit: b.closingDebit,
      credit: b.closingCredit,
      parentId: b.account.parentId,
      id: b.account.id,
    });
  }

  // 4. Build parent(id) → [childCode] map
  const childrenOfId = new Map<number, string[]>();
  for (const a of ownByCode.values()) {
    if (a.parentId != null) {
      const arr = childrenOfId.get(a.parentId) || [];
      arr.push(a.code);
      childrenOfId.set(a.parentId, arr);
    }
  }

  // 5. For each account, compute children sum + residual
  const residuals: { code: string; name: string; debit: number; credit: number }[] = [];
  for (const a of ownByCode.values()) {
    const childCodes = childrenOfId.get(a.id) || [];
    let childDebit = 0;
    let childCredit = 0;
    for (const cc of childCodes) {
      const c = ownByCode.get(cc);
      if (c) {
        childDebit += c.debit;
        childCredit += c.credit;
      }
    }
    const resDebit = a.debit - childDebit;
    const resCredit = a.credit - childCredit;
    if (Math.abs(resDebit) > 0.01 || Math.abs(resCredit) > 0.01) {
      residuals.push({ code: a.code, name: a.name, debit: resDebit, credit: resCredit });
    }
  }

  // 6. Preload mappings (batch)
  const mappings = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode, year, statementType },
    select: { accountCode: true, lineCode: true },
  });
  const mappingMap = new Map<string, string>();
  for (const m of mappings) mappingMap.set(m.accountCode, m.lineCode);

  // 7. Preload accounts for parent-chain resolution (batch)
  const accounts = await prisma.financeAccount.findMany({
    where: { companyCode, year },
    select: { code: true, parent: { select: { code: true } } },
  });
  const parentMap = new Map<string, string | null>();
  for (const a of accounts) parentMap.set(a.code, a.parent?.code ?? null);

  // 8. Resolve each residual node's lineCode via effective mapping (in-memory)
  const byLine = new Map<string, { debit: number; credit: number; accountCodes: string[] }>();
  const unresolved: UnresolvedAccount[] = [];
  const residualParents: ResidualParent[] = [];

  for (const r of residuals) {
    const lineCode = resolveLineCode(r.code, parentMap, mappingMap);
    if (lineCode) {
      const agg = byLine.get(lineCode) || { debit: 0, credit: 0, accountCodes: [] };
      agg.debit += r.debit;
      agg.credit += r.credit;
      agg.accountCodes.push(r.code);
      byLine.set(lineCode, agg);
      // Diagnostics: parents (non-leaf) that contributed residual
      const own = ownByCode.get(r.code)!;
      const childCodes = childrenOfId.get(own.id) || [];
      if (childCodes.length > 0) {
        let cD = 0, cC = 0;
        for (const cc of childCodes) {
          const c = ownByCode.get(cc);
          if (c) { cD += c.debit; cC += c.credit; }
        }
        residualParents.push({
          accountCode: r.code,
          accountName: r.name,
          lineCode,
          residualDebit: r.debit,
          residualCredit: r.credit,
          ownDebit: own.debit,
          ownCredit: own.credit,
          childrenDebit: cD,
          childrenCredit: cC,
        });
      }
    } else {
      const own = ownByCode.get(r.code);
      unresolved.push({
        accountCode: r.code,
        accountName: r.name,
        debit: r.debit,
        credit: r.credit,
        net: r.debit - r.credit,
      });
    }
  }

  // 9. Build result
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
    balanceBearingCount: residuals.length,
    totalAccountCount: ownByCode.size,
    resolvedCount: residuals.length - unresolved.length,
    residualParents: residualParents.sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
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
