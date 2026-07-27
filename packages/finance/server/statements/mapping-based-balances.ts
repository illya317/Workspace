/** M10a: mapping-based balance aggregation with residual leaf. residual = own - children sum. */
import { prisma } from "@workspace/platform/server/prisma";
import {
  SUPPLEMENTAL_VOUCHER_TYPE_NAME,
  WORKSPACE_VOUCHER_SOURCE_SYSTEM,
} from "@workspace/finance/types";
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

export interface ProfitOrLossCarryforward extends UnresolvedAccount {
  category: string;
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
  /** Unclosed profit/loss balances presented through retained earnings. */
  profitOrLossCarryforward: ProfitOrLossCarryforward[];
}

const PROFIT_OR_LOSS_CATEGORIES = new Set(["revenue", "cost", "expense"]);

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
      account: { select: { id: true, code: true, name: true, category: true, parentId: true } },
    },
  });

  // 3. Index balances by accountCode (own balance) and by id
  const ownByCode = new Map<string, { code: string; name: string; category: string; debit: number; credit: number; parentId: number | null; id: number }>();
  for (const b of balances) {
    ownByCode.set(b.account.code, {
      code: b.account.code,
      name: b.account.name,
      category: b.account.category,
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
  const residuals: { code: string; name: string; category: string; debit: number; credit: number }[] = [];
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
      residuals.push({ code: a.code, name: a.name, category: a.category, debit: resDebit, credit: resCredit });
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
  const profitOrLossCarryforward: ProfitOrLossCarryforward[] = [];

  for (const r of residuals) {
    const resolved = resolveMappedLineWithOperator(r.code, parentMap, mappingMap, operatorMap);
    const presentation = resolved ?? (PROFIT_OR_LOSS_CATEGORIES.has(r.category)
      ? { lineCode: "undistributedProfit", operator: "add" as const }
      : null);
    if (presentation) {
      const { lineCode, operator } = presentation;
      const side = lineSideMap.get(lineCode) || "debit";
      const agg = byLine.get(lineCode) || { debit: 0, credit: 0, accountCodes: [] };
      applyContribution(agg, r, side, operator, r.code);
      byLine.set(lineCode, agg);
      const rp = buildResidualParent(r, lineCode, ownByCode, childrenOfId);
      if (rp) residualParents.push(rp);
      if (!resolved) profitOrLossCarryforward.push({
        accountCode: r.code,
        accountName: r.name,
        category: r.category,
        debit: r.debit,
        credit: r.credit,
        net: r.debit - r.credit,
      });
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

  // A historical Workspace supplement predating the active ERP balance baseline
  // cannot be rolled into that immutable source snapshot. Apply it as a durable
  // ledger overlay at every later balance-sheet point instead of mutating ERP
  // balances or encoding a one-off consolidation amount.
  const baseline = await prisma.financeBalanceSnapshot.findFirst({
    where: {
      companyCode,
      snapshotType: "baseline",
      isActive: true,
      year: { lte: year },
    },
    select: { year: true },
    orderBy: { year: "desc" },
  });
  if (baseline) {
    const monthText = String(month).padStart(2, "0");
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cutoff = balancePoint === "opening"
      ? { lt: `${year}-${monthText}-01` }
      : { lte: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}` };
    const supplementalItems = await prisma.financeVoucherItem.findMany({
      where: {
        voucher: {
          companyCode,
          status: "posted",
          sourceSystem: WORKSPACE_VOUCHER_SOURCE_SYSTEM,
          voucherTypeName: SUPPLEMENTAL_VOUCHER_TYPE_NAME,
          date: cutoff,
          period: { year: { lte: baseline.year } },
        },
      },
      include: { account: { select: { code: true, category: true } } },
    });
    for (const item of supplementalItems) {
      const resolved = resolveMappedLineWithOperator(item.account.code, parentMap, mappingMap, operatorMap);
      const presentation = resolved ?? (PROFIT_OR_LOSS_CATEGORIES.has(item.account.category)
        ? { lineCode: "undistributedProfit", operator: "add" as const }
        : null);
      if (!presentation) continue;
      const side = lineSideMap.get(presentation.lineCode) || "debit";
      const agg = byLine.get(presentation.lineCode) || { debit: 0, credit: 0, accountCodes: [] };
      applyContribution(agg, {
        debit: item.debit,
        credit: item.credit,
      }, side, presentation.operator, `supplemental:${item.account.code}`);
      byLine.set(presentation.lineCode, agg);
    }
  }

  // Reference workpapers may explicitly exclude a posted voucher from the
  // balance-sheet presentation without mutating the ledger. Reverse only the
  // mapped line contribution; the original voucher and balances stay intact.
  if (balancePoint === "closing") {
    const exclusions = await prisma.financeStatementVoucherExclusion.findMany({
      where: {
        companyCode,
        statementType: "balance",
        enabled: true,
        voucher: { status: "posted", period: { year, month: { lte: month } } },
      },
      include: {
        voucher: {
          include: {
            items: { include: { account: { select: { code: true, category: true } } } },
          },
        },
      },
    });
    for (const exclusion of exclusions) {
      for (const item of exclusion.voucher.items) {
        const resolved = resolveMappedLineWithOperator(
          item.account.code,
          parentMap,
          mappingMap,
          operatorMap,
        );
        const presentation = resolved ?? (PROFIT_OR_LOSS_CATEGORIES.has(item.account.category)
          ? { lineCode: "undistributedProfit", operator: "add" as const }
          : null);
        if (!presentation) continue;
        const side = lineSideMap.get(presentation.lineCode) || "debit";
        const naturalContribution = side === "debit"
          ? item.debit - item.credit
          : item.credit - item.debit;
        const presentedContribution = presentation.operator === "subtract"
          ? -Math.abs(naturalContribution)
          : naturalContribution;
        const agg = byLine.get(presentation.lineCode) || { debit: 0, credit: 0, accountCodes: [] };
        applySignedContribution(agg, -presentedContribution, side, `excluded:${item.account.code}`);
        byLine.set(presentation.lineCode, agg);
      }
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
    profitOrLossCarryforward: profitOrLossCarryforward.sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
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
  applySignedContribution(agg, adjusted, side, accountCode);
}

function applySignedContribution(
  agg: { debit: number; credit: number; accountCodes: string[] },
  adjusted: number,
  side: "debit" | "credit",
  accountCode: string,
) {
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
