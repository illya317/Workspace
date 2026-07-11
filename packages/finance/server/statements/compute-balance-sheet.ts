import type { BalanceSheetLineConfig } from "./config/balance-sheet-lines";
import type { ReclassLineRouting } from "./mapping/reclass-routing";
import { mk, mkC } from "./report-helpers";

export interface ComputedLine {
  lineCode: string;
  label: string;
  displayCode: string;
  amount: number;
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  _debit: number;
  _credit: number;
}

export interface ComputeBalanceSheetParams {
  config: BalanceSheetLineConfig[];
  mappingByLine: ReadonlyMap<string, { debit: number; credit: number }>;
  reclassByLine: ReclassLineRouting;
}

export function computeBalanceSheetLines(params: ComputeBalanceSheetParams): {
  lines: ComputedLine[];
  diagnostics: string[];
} {
  const computed: ComputedLine[] = [];

  for (const line of params.config) {
    if (line.isHeader) {
      computed.push(baseLine(line, { amount: 0, isHeader: true }));
      continue;
    }

    if (line.isTotal) {
      const amount = computed
        .filter((item) => params.config.find((candidate) => candidate.lineCode === item.lineCode)?.section === line.section)
        .filter((item) => !item.isHeader && !item.isTotal && !item.isGrandTotal)
        .reduce((sum, item) => sum + item.amount, 0);
      computed.push(baseLine(line, { amount, isTotal: true }));
      continue;
    }

    if (line.isGrandTotal) {
      const sections = line.lineCode === "totalLiabilities"
        ? ["currentLiabilities", "nonCurrentLiabilities"]
        : ["currentAssets", "nonCurrentAssets"];
      const amount = computed
        .filter((item) => item.isTotal && sections.includes(
          params.config.find((candidate) => candidate.lineCode === item.lineCode)?.section || "",
        ))
        .reduce((sum, item) => sum + item.amount, 0);
      computed.push(baseLine(line, { amount, isGrandTotal: true }));
      continue;
    }

    const natural = params.mappingByLine.get(line.lineCode) ?? { debit: 0, credit: 0 };
    const deduction = params.reclassByLine.deductionsByLine.get(line.lineCode) ?? { debit: 0, credit: 0 };
    const addition = params.reclassByLine.additionsByLine.get(line.lineCode) ?? { debit: 0, credit: 0 };
    const debit = natural.debit - deduction.debit + addition.debit;
    const credit = natural.credit - deduction.credit + addition.credit;
    const amount = line.side === "debit" ? mk(debit, credit) : mkC(debit, credit);
    computed.push({
      lineCode: line.lineCode,
      label: line.label,
      displayCode: line.displayCode,
      amount,
      _debit: debit,
      _credit: credit,
    });
  }

  return { lines: computed, diagnostics: [] };
}

export function computeBalanceSheet(
  config: BalanceSheetLineConfig[],
  mappingByLine: ReadonlyMap<string, { debit: number; credit: number }>,
  reclassByLine: ReclassLineRouting,
) {
  return computeBalanceSheetLines({ config, mappingByLine, reclassByLine });
}

function baseLine(
  line: BalanceSheetLineConfig,
  input: { amount: number; isHeader?: boolean; isTotal?: boolean; isGrandTotal?: boolean },
): ComputedLine {
  return {
    lineCode: line.lineCode,
    label: line.label,
    displayCode: line.displayCode,
    amount: +input.amount.toFixed(2),
    ...(input.isHeader ? { isHeader: true } : {}),
    ...(input.isTotal ? { isTotal: true } : {}),
    ...(input.isGrandTotal ? { isGrandTotal: true } : {}),
    _debit: 0,
    _credit: 0,
  };
}
