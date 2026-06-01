/**
 * M11: lineCode-keyed reclass routing.
 *
 * Unlike reclassifyFromEntries() in report-helpers.ts, which keys by account
 * code and lets the consumer prefix-match against line.prefixes, this helper
 * resolves each ReclassEntry's sourceAccount and targetAccount to a lineCode
 * via the effective mapping (nearest-ancestor), and returns lineCode-keyed
 * deduction/addition maps plus diagnostics for unresolved entries.
 *
 * Debit/credit semantics are preserved from reclassifyFromEntries:
 *   - Asset source (1xxx): deduction credit += amount; addition credit += amount
 *   - Liability source (2xxx): deduction debit += amount; addition debit += amount
 *   - Other prefixes (3xxx, 4xxx, ...): no movement applied (mirrors current code)
 *
 * Caller flow (mapping mode):
 *   const { deductionsByLine, additionsByLine, unresolved } =
 *     await resolveReclassEntriesToLines(companyCode, year, entries);
 *   // pass to computeBalanceSheetLines; unresolved → diagnostics
 */
import { prisma } from "@/lib/prisma";
import type { ReclassEntry } from "../report-helpers";
import { ensureStatementMappings } from "./seed-from-config";

export type UnresolvedReclassReason = "noSourceLine" | "noTargetLine";

export interface UnresolvedReclassEntry {
  entry: ReclassEntry;
  reason: UnresolvedReclassReason;
}

export interface ReclassLineRouting {
  /** Deductions keyed by lineCode: amounts to REMOVE from each line */
  deductionsByLine: Map<string, { debit: number; credit: number }>;
  /** Additions keyed by lineCode: amounts to ADD to each line */
  additionsByLine: Map<string, { debit: number; credit: number }>;
  /** Entries that could not be resolved to a line on one or both sides */
  unresolved: UnresolvedReclassEntry[];
}

/**
 * Resolve reclass entries to lineCode-keyed routing via the effective mapping.
 *
 * Each entry's `amount` is the magnitude. The debit/credit side is determined
 * by the source account's first digit (1xxx = credit movement, 2xxx = debit
 * movement), matching reclassifyFromEntries exactly.
 */
export async function resolveReclassEntriesToLines(
  companyCode: string,
  year: number,
  entries: ReclassEntry[],
  statementType: string = "balance",
): Promise<ReclassLineRouting> {
  await ensureStatementMappings(companyCode, year, statementType);

  // Preload mappings for in-memory resolution
  const mappings = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode, year, statementType },
    select: { accountCode: true, lineCode: true },
  });
  const mappingMap = new Map<string, string>();
  for (const m of mappings) mappingMap.set(m.accountCode, m.lineCode);

  // Preload parent chain info for nearest-ancestor resolution
  const accounts = await prisma.financeAccount.findMany({
    where: { companyCode, year },
    select: { code: true, parent: { select: { code: true } } },
  });
  const parentMap = new Map<string, string | null>();
  for (const a of accounts) parentMap.set(a.code, a.parent?.code ?? null);

  const deductionsByLine = new Map<string, { debit: number; credit: number }>();
  const additionsByLine = new Map<string, { debit: number; credit: number }>();
  const unresolved: UnresolvedReclassEntry[] = [];

  for (const entry of entries) {
    const sourceLineCode = resolveLineCode(entry.sourceAccount, parentMap, mappingMap);
    const targetLineCode = resolveLineCode(entry.targetAccount, parentMap, mappingMap);

    if (!sourceLineCode) {
      unresolved.push({ entry, reason: "noSourceLine" });
      continue;
    }
    if (!targetLineCode) {
      unresolved.push({ entry, reason: "noTargetLine" });
      continue;
    }

    applyReclassDelta(entry, sourceLineCode, targetLineCode, deductionsByLine, additionsByLine);
  }

  return { deductionsByLine, additionsByLine, unresolved };
}

function applyReclassDelta(
  entry: ReclassEntry,
  sourceLineCode: string,
  targetLineCode: string,
  deductionsByLine: Map<string, { debit: number; credit: number }>,
  additionsByLine: Map<string, { debit: number; credit: number }>,
): void {
  // Mirror reclassifyFromEntries: first digit of sourceAccount determines side.
  const isAsset = entry.sourceAccount.startsWith("1");
  const isLiability = entry.sourceAccount.startsWith("2");

  if (isAsset) {
    const d = deductionsByLine.get(sourceLineCode) || { debit: 0, credit: 0 };
    d.credit += entry.amount;
    deductionsByLine.set(sourceLineCode, d);
    const a = additionsByLine.get(targetLineCode) || { debit: 0, credit: 0 };
    a.credit += entry.amount;
    additionsByLine.set(targetLineCode, a);
  } else if (isLiability) {
    const d = deductionsByLine.get(sourceLineCode) || { debit: 0, credit: 0 };
    d.debit += entry.amount;
    deductionsByLine.set(sourceLineCode, d);
    const a = additionsByLine.get(targetLineCode) || { debit: 0, credit: 0 };
    a.debit += entry.amount;
    additionsByLine.set(targetLineCode, a);
  }
  // 3xxx/4xxx/...: no movement (matches reclassifyFromEntries which only acts on 1xxx/2xxx)
}

// ─── In-memory lineCode resolver (mirrors mapping-based-balances.ts) ───
// Kept in this file for now; if a third caller needs it, extract to a shared
// line-resolver module.

function buildParentChain(
  code: string,
  parentMap: Map<string, string | null>,
): string[] {
  const chain: string[] = [code];
  const parent = parentMap.get(code);
  if (parent) return [...chain, ...buildParentChain(parent, parentMap)];
  // Prefix fallback for accounts without parentId links
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
