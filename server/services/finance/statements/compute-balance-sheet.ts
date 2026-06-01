import type { BalanceItem, ReclassRouting } from "./report-helpers";
import { mk, mkC } from "./report-helpers";
import type { ReclassLineRouting } from "./mapping/reclass-routing";
import type { BalanceSheetLineConfig } from "./config/balance-sheet-lines";
import { computeLineBase, computeOtherReceivableNet, sumByPrefix } from "./compute-balance-sheet-legacy";

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
  /** M10b: mapping-based leaf aggregation by lineCode */
  mappingByLine?: Map<string, { debit: number; credit: number }>;
  /** M11: lineCode-keyed reclass routing; used in mapping mode in place of `reclass` */
  reclassByLine?: ReclassLineRouting;
}

// ─── Main Compute ──────────────────────────────────────────

export function computeBalanceSheetLines(params: ComputeBalanceSheetParams): {
  lines: ComputedLine[];
  diagnostics: string[];
} {
  const { balances, reclass, reclassByLine } = params;
  const diagnostics: string[] = [];
  const computed: ComputedLine[] = [];

  // Track which reclass entries were matched to a line
  const matchedSources = new Set<string>();
  const matchedTargets = new Set<string>();

  for (const line of params.config) {
    const mappingByLine = params.mappingByLine;
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

    // M10b: prefer mapping-based leaf aggregation over prefix-based.
    // M11: when mapping is active, the line's natural balance is taken from
    // the aggregation (defaulting to 0 if no leaves resolved to it), and any
    // reclass additions/deductions are layered on top. This means a line with
    // no natural balance but a reclass addition (e.g. otherCurrentAssets
    // receiving 2241→1463) still picks up that amount.
    if (mappingByLine && mappingByLine.size > 0) {
      const fromMapping = mappingByLine.get(line.lineCode);
      let debit = fromMapping?.debit ?? 0;
      let credit = fromMapping?.credit ?? 0;

      if (reclassByLine) {
        const d = reclassByLine.deductionsByLine.get(line.lineCode);
        if (d) { debit -= d.debit; credit -= d.credit; }
        const a = reclassByLine.additionsByLine.get(line.lineCode);
        if (a) { debit += a.debit; credit += a.credit; }
      } else {
        // Legacy prefix-based reclass (kept for callers without M11 routing)
        if (line.reclassSource && line.prefixes) {
          for (const prefix of line.prefixes) {
            const s = sumByPrefix(reclass.deductions, prefix);
            debit -= s.debit; credit -= s.credit;
          }
        }
        if (line.reclassTarget && line.prefixes) {
          for (const prefix of line.prefixes) {
            const t = sumByPrefix(reclass.additions, prefix);
            debit += t.debit; credit += t.credit;
          }
        }
      }

      // In mapping mode, contra accounts are mapped into the same line and reduce
      // the amount naturally via line.side, so subtractPrefixes is legacy-only.
      // (See `computeLineBase` in compute-balance-sheet-legacy for the prefixes-fallback path.)

      dc = { debit, credit };
    } else if (line.lineCode === "otherReceivableNet") {
      // Legacy prefixes path
      dc = computeOtherReceivableNet(balances, reclass);
    } else {
      // Legacy prefixes path
      dc = computeLineBase(line, balances, reclass);
    }

    // Track which reclass entries were matched
    if (reclassByLine) {
      // M11: in mapping mode, all routed entries are matched at the lineCode level;
      // unresolved entries are surfaced via reclassByLine.unresolved elsewhere.
      for (const code of reclassByLine.deductionsByLine.keys()) matchedSources.add(code);
      for (const code of reclassByLine.additionsByLine.keys()) matchedTargets.add(code);
    } else {
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
    }

    const amount = line.side === "debit" ? mk(dc.debit, dc.credit) : mkC(dc.debit, dc.credit);
    computed.push({
      lineCode: line.lineCode, label: line.label, displayCode: line.displayCode,
      amount, _debit: dc.debit, _credit: dc.credit,
    });
  }

  // Diagnostics: unmatched reclass sources/targets
  // In M11 mapping mode, the caller surfaces unresolved entries from
  // `reclassByLine.unresolved` separately, so the legacy prefix-match
  // diagnostic (which compares account codes against lineCodes) is skipped.
  if (!reclassByLine) {
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
  }

  return { lines: computed, diagnostics };
}

/** Convenience wrapper that takes config + params */
export function computeBalanceSheet(
  config: BalanceSheetLineConfig[],
  balances: BalanceItem[],
  reclass: ReclassRouting,
  mappingByLine?: Map<string, { debit: number; credit: number }>,
  reclassByLine?: ReclassLineRouting,
): { lines: ComputedLine[]; diagnostics: string[] } {
  return computeBalanceSheetLines({ config, balances, reclass, mappingByLine, reclassByLine });
}
