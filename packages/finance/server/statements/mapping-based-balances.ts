/** M10a: mapping-based balance aggregation with residual leaf. residual = own - children sum. */
import { prisma } from "@workspace/platform/server/prisma";
import { ensureStatementMappings } from "./mapping/seed-from-config";
import { resolveMappedLineWithOperator } from "./shared/mapping-resolver";

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

  // 6. Preload mappings with operator (batch)
  const mappings = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode, year, statementType },
    select: { accountCode: true, lineCode: true, operator: true },
  });
  const mappingMap = new Map<string, string>();
  const operatorMap = new Map<string, "add" | "subtract" | "exclude">();
  for (const m of mappings) { mappingMap.set(m.accountCode, m.lineCode); operatorMap.set(m.accountCode, (m.operator as "add" | "subtract" | "exclude") || "add"); }

  // 6b. Preload line configs for side lookup
  const lineConfigs = await prisma.financeStatementLineConfig.findMany({
    where: { companyCode, year, reportType: "balanceSheet", enabled: true },
    select: { lineCode: true, side: true },
  });
  const lineSideMap = new Map<string, "debit" | "credit">();
  for (const lc of lineConfigs) lineSideMap.set(lc.lineCode, lc.side as "debit" | "credit");

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
    const resolved = resolveMappedLineWithOperator(r.code, parentMap, mappingMap, operatorMap);
    if (resolved) {
      const { lineCode, operator } = resolved;
      const side = lineSideMap.get(lineCode) || "debit";
      const agg = byLine.get(lineCode) || { debit: 0, credit: 0, accountCodes: [] };
      applyContribution(agg, r, side, operator, r.code);
      byLine.set(lineCode, agg);
      const rp = buildResidualParent(r, lineCode, ownByCode, childrenOfId);
      if (rp) residualParents.push(rp);
    } else {
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

// ─── Helpers ───────────────────────────────────────────────

/** Compute normalized contribution for one residual, apply operator, write to agg buckets. */
function applyContribution(
  agg: { debit: number; credit: number; accountCodes: string[] },
  r: { debit: number; credit: number },
  side: "debit" | "credit",
  operator: "add" | "subtract",
  accountCode: string,
) {
  const contribution = side === "debit" ? r.debit - r.credit : r.credit - r.debit;
  const adjusted = operator === "subtract" ? -Math.abs(contribution) : contribution;
  if (side === "debit") {
    if (adjusted >= 0) agg.debit += adjusted; else agg.credit += -adjusted;
  } else {
    if (adjusted >= 0) agg.credit += adjusted; else agg.debit += -adjusted;
  }
  agg.accountCodes.push(accountCode);
}

/** Assemble a ResidualParent diagnostic for a non-leaf residual. */
function buildResidualParent(r: { code: string; name: string; debit: number; credit: number },
  lineCode: string, ownByCode: Map<string, { id: number; debit: number; credit: number }>, childrenOfId: Map<number, string[]>): ResidualParent | null {
  const own = ownByCode.get(r.code)!;
  const childCodes = childrenOfId.get(own.id) || [];
  if (childCodes.length === 0) return null;
  let cD = 0, cC = 0;
  for (const cc of childCodes) { const c = ownByCode.get(cc); if (c) { cD += c.debit; cC += c.credit; } }
  return { accountCode: r.code, accountName: r.name, lineCode, residualDebit: r.debit, residualCredit: r.credit, ownDebit: own.debit, ownCredit: own.credit, childrenDebit: cD, childrenCredit: cC };
}
