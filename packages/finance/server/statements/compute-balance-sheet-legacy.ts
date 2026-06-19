/**
 * Legacy prefix-based helpers for compute-balance-sheet.
 *
 * These are used only when mapping-based aggregation is unavailable
 * (e.g. no company code, or mapping returns no resolved lines).
 * Mapping mode bypasses them entirely.
 */
import type { BalanceItem, ReclassRouting } from "./report-helpers";
import { closingNetLeaf } from "./report-helpers";
import type { BalanceSheetLineConfig } from "./config/balance-sheet-lines";

/** Sum a per-account debit/credit map across all entries whose key starts with `prefix`. */
export function sumByPrefix(
  map: Map<string, { debit: number; credit: number }>,
  prefix: string,
): { debit: number; credit: number } {
  let d = 0, c = 0;
  for (const [code, v] of map) {
    if (code.startsWith(prefix)) { d += v.debit; c += v.credit; }
  }
  return { debit: d, credit: c };
}

/**
 * Compute the base balance for a line, applying reclass source deductions
 * and target additions, and subtracting any subtractPrefixes.
 */
export function computeLineBase(
  line: BalanceSheetLineConfig,
  balances: BalanceItem[],
  reclass: ReclassRouting,
): { debit: number; credit: number } {
  if (!line.prefixes || line.prefixes.length === 0) {
    return { debit: 0, credit: 0 };
  }

  const base = closingNetLeaf(balances, line.prefixes);
  let debit = base.debit;
  let credit = base.credit;

  // Apply reclass source deductions (amounts to REMOVE from this line)
  if (line.reclassSource) {
    for (const prefix of line.prefixes) {
      const s = sumByPrefix(reclass.deductions, prefix);
      debit -= s.debit;
      credit -= s.credit;
    }
  }

  // Apply reclass target additions (amounts to ADD to this line)
  if (line.reclassTarget) {
    for (const prefix of line.prefixes) {
      const t = sumByPrefix(reclass.additions, prefix);
      debit += t.debit;
      credit += t.credit;
    }
  }

  // Apply subtract prefixes (e.g., accumulated depreciation)
  if (line.subtractPrefixes && line.subtractPrefixes.length > 0) {
    const sub = closingNetLeaf(balances, line.subtractPrefixes);
    debit -= sub.debit;
    credit -= sub.credit;
  }

  return { debit, credit };
}

/**
 * Special-case compute for otherReceivableNet:
 *   otherReceivable(1221) - badDebtAllowance(1231) - reclass source(1221)
 * The badDebtAllowance credit is subtracted from the debit side (contra-asset).
 */
export function computeOtherReceivableNet(
  balances: BalanceItem[],
  reclass: ReclassRouting,
): { debit: number; credit: number } {
  const gross = closingNetLeaf(balances, ["1221"]);
  const allowance = closingNetLeaf(balances, ["1231"]);
  const src = sumByPrefix(reclass.deductions, "1221");

  return {
    debit: gross.debit - allowance.credit - src.debit,
    credit: gross.credit - src.credit,
  };
}
