/** M10a: mapping-based balance aggregation with residual leaf. residual = own - children sum. */
import { prisma } from "@workspace/platform/server/prisma";
import {
  buildFixedBalanceLineSideMap,
  buildFixedBalanceAssignments,
} from "./config/fixed-balance-definition";
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
  balancePoint: "opening" | "closing" = "closing",
): Promise<MappingBasedBalancesResult> {
  if (statementType !== "balance") throw new Error("statementType 暂只支持 balance");

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
      debit: balancePoint === "opening" ? b.openingDebit : b.closingDebit,
      credit: balancePoint === "opening" ? b.openingCredit : b.closingCredit,
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
    const resDebit = roundMoney(a.debit - childDebit);
    const resCredit = roundMoney(a.credit - childCredit);
    if (resDebit !== 0 || resCredit !== 0) {
      residuals.push({ code: a.code, name: a.name, debit: resDebit, credit: resCredit });
    }
  }

  // 6. Fixed statutory mapping (single source of truth).
  const { mappingMap, operatorMap } = buildFixedBalanceAssignments();
  const lineSideMap = buildFixedBalanceLineSideMap();

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

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
