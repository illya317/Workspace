import type { BalanceItem, ReclassRouting } from "./report-helpers";
import { closingNetLeaf, mk, mkC } from "./report-helpers";
import type { BalanceSheetLineConfig } from "./config/balance-sheet-lines";

export interface ComputedLine {
  lineCode: string;
  label: string;
  displayCode: string;
  amount: number;
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  /** Raw debit/credit before mk/mkC (for diagnostics) */
  _debit: number;
  _credit: number;
}

export interface ComputeBalanceSheetParams {
  config: BalanceSheetLineConfig[];
  balances: BalanceItem[];
  reclass: ReclassRouting;
}

// ─── Helpers ───────────────────────────────────────────────

function sumByPrefix(
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
function computeLineBase(
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
function computeOtherReceivableNet(
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

// ─── Main Compute ──────────────────────────────────────────

export function computeBalanceSheetLines(params: ComputeBalanceSheetParams): {
  lines: ComputedLine[];
  diagnostics: string[];
} {
  const { balances, reclass } = params;
  const diagnostics: string[] = [];
  const computed: ComputedLine[] = [];

  // Track which reclass entries were matched to a line
  const matchedSources = new Set<string>();
  const matchedTargets = new Set<string>();

  for (const line of params.config) {
    if (line.isHeader) {
      computed.push({
        lineCode: line.lineCode, label: line.label, displayCode: line.displayCode,
        amount: 0, isHeader: true, _debit: 0, _credit: 0,
      });
      continue;
    }

    if (line.isTotal) {
      // Total = sum of all non-header, non-total lines in the same section
      const sectionLines = computed.filter(
        (l) => params.config.find(c => c.lineCode === l.lineCode)?.section === line.section
          && !l.isHeader && !l.isTotal && !l.isGrandTotal,
      );
      const total = sectionLines.reduce((s, l) => s + l.amount, 0);
      computed.push({
        lineCode: line.lineCode, label: line.label, displayCode: line.displayCode,
        amount: +total.toFixed(2), isTotal: true, _debit: 0, _credit: 0,
      });
      continue;
    }

    if (line.isGrandTotal) {
      // Grand total = sum of section totals (assets or liabilities)
      const grandTotalSections = line.lineCode === "totalLiabilities"
        ? ["currentLiabilities", "nonCurrentLiabilities"]
        : ["currentAssets", "nonCurrentAssets"];
      const sectionTotals = computed.filter(
        (l) => l.isTotal && grandTotalSections.includes(
          params.config.find(c => c.lineCode === l.lineCode)?.section || "",
        ),
      );
      const total = sectionTotals.reduce((s, l) => s + l.amount, 0);
      computed.push({
        lineCode: line.lineCode, label: line.label, displayCode: line.displayCode,
        amount: +total.toFixed(2), isGrandTotal: true, _debit: 0, _credit: 0,
      });
      continue;
    }

    // Compute the line amount
    let dc: { debit: number; credit: number };
    if (line.lineCode === "otherReceivableNet") {
      dc = computeOtherReceivableNet(balances, reclass);
    } else {
      dc = computeLineBase(line, balances, reclass);
    }

    // Track which reclass entries were matched
    if (line.reclassSource && line.prefixes) {
      for (const prefix of line.prefixes) {
        for (const code of reclass.deductions.keys()) {
          if (code.startsWith(prefix)) matchedSources.add(code);
        }
      }
    }
    if (line.reclassTarget && line.prefixes) {
      for (const prefix of line.prefixes) {
        for (const code of reclass.additions.keys()) {
          if (code.startsWith(prefix)) matchedTargets.add(code);
        }
      }
    }

    const amount = line.side === "debit" ? mk(dc.debit, dc.credit) : mkC(dc.debit, dc.credit);
    computed.push({
      lineCode: line.lineCode, label: line.label, displayCode: line.displayCode,
      amount, _debit: dc.debit, _credit: dc.credit,
    });
  }

  // Diagnostics: unmatched reclass sources/targets
  for (const code of reclass.deductions.keys()) {
    if (!matchedSources.has(code)) {
      diagnostics.push(`重分类源科目 ${code} 未匹配到任何报表行`);
    }
  }
  for (const code of reclass.additions.keys()) {
    if (!matchedTargets.has(code)) {
      diagnostics.push(`重分类目标科目 ${code} 未匹配到任何报表行`);
    }
  }

  return { lines: computed, diagnostics };
}

/** Convenience wrapper that takes config + params */
export function computeBalanceSheet(
  config: BalanceSheetLineConfig[],
  balances: BalanceItem[],
  reclass: ReclassRouting,
): { lines: ComputedLine[]; diagnostics: string[] } {
  return computeBalanceSheetLines({ config, balances, reclass });
}
