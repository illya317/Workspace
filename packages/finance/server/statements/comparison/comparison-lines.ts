import {
  decimalLikeToMinorUnits,
  DecimalNormalizationError,
  formatMinorUnits,
  LEDGER_MONEY_SCALE,
  numberToMinorUnits,
} from "../amount-explanation/decimal";
import type { DetectedStatementStructure, LineMappingEntry } from "./mapping";
import type { WorkbookAnalysisSnapshot } from "./workbook-dto";

/**
 * 对比行计算（纯函数；系统侧金额由调用方注入，目标解析归 Package 6/7）。
 * 金额一律 canonical cents（bigint minor units），绝不比较格式化显示串。
 */

export interface ComparisonRunLineInput {
  lineCode: string;
  lineLabel: string;
  sortOrder: number;
  sourceSheet: string | null;
  sourceCell: string | null;
  /** 规范化十进制字符串（canonical cents 比较结果；null = 该侧缺失）。 */
  externalAmount: string | null;
  systemAmount: string | null;
  differenceAmount: string | null;
  explainedAmount: string | null;
  residualAmount: string | null;
  explanationStatus: string;
  explanationMethod: string | null;
  evidence?: unknown;
  alternatives?: unknown;
  diagnostics?: unknown;
}

// ─── 对比行计算（纯函数；系统侧金额由调用方注入，目标解析归 Package 6/7）───────

export interface SystemStatementLine {
  lineCode: string;
  label: string;
  sortOrder: number;
  /** 系统侧金额（minor units，scale 2）；null = 系统侧缺失。 */
  amountMinor: bigint | null;
}

/**
 * 由确认的 mapping + workbook 快照 + 系统侧行金额计算对比行。
 * 金额一律 canonical cents（bigint minor units），绝不比较格式化显示串。
 * 本阶段不做金额来源解释（Package 6 经 explainAmountOrigin 补 explained/residual），
 * explanationStatus 一律 "notEvaluated"。
 */
export function buildComparisonLines(input: {
  analysis: WorkbookAnalysisSnapshot;
  structureMapping: DetectedStatementStructure;
  lineMapping: LineMappingEntry[];
  systemLines: readonly SystemStatementLine[];
}): ComparisonRunLineInput[] {
  const { analysis, structureMapping, lineMapping, systemLines } = input;
  const sheet = analysis.dto.sheets.find((entry) => entry.name === structureMapping.sheetName);
  const cellByA1 = new Map<string, { value: unknown; cachedValue?: unknown }>();
  if (sheet) {
    for (const cell of sheet.cells) {
      cellByA1.set(cell.a1, { value: cell.value, cachedValue: cell.cachedValue });
    }
  }

  const systemByLineCode = new Map(systemLines.map((line) => [line.lineCode, line]));
  const rows: ComparisonRunLineInput[] = [];
  const seen = new Set<string>();

  const externalMinorOf = (a1: string | undefined): bigint | null => {
    if (!a1) return null;
    const cell = cellByA1.get(a1);
    if (!cell) return null;
    const raw = cell.cachedValue !== undefined ? cell.cachedValue : cell.value;
    try {
      if (typeof raw === "number") return numberToMinorUnits(raw, LEDGER_MONEY_SCALE);
      if (typeof raw === "string") return decimalLikeToMinorUnits(raw.replace(/,/g, ""), LEDGER_MONEY_SCALE);
      return null;
    } catch (error) {
      if (error instanceof DecimalNormalizationError) return null;
      throw error;
    }
  };

  const pushRow = (
    lineCode: string,
    lineLabel: string,
    sortOrder: number,
    sourceCell: string | null,
    externalMinor: bigint | null,
    systemMinor: bigint | null,
  ) => {
    if (seen.has(lineCode)) return;
    seen.add(lineCode);
    const difference = externalMinor !== null && systemMinor !== null ? externalMinor - systemMinor : null;
    rows.push({
      lineCode,
      lineLabel,
      sortOrder,
      sourceSheet: sourceCell === null ? null : structureMapping.sheetName,
      sourceCell,
      externalAmount: externalMinor === null ? null : formatMinorUnits(externalMinor, LEDGER_MONEY_SCALE),
      systemAmount: systemMinor === null ? null : formatMinorUnits(systemMinor, LEDGER_MONEY_SCALE),
      differenceAmount: difference === null ? null : formatMinorUnits(difference, LEDGER_MONEY_SCALE),
      explainedAmount: null,
      residualAmount: difference === null ? null : formatMinorUnits(difference, LEDGER_MONEY_SCALE),
      explanationStatus: "notEvaluated",
      explanationMethod: null,
    });
  };

  for (const entry of lineMapping) {
    if (entry.lineCode === null) continue;
    const system = systemByLineCode.get(entry.lineCode);
    pushRow(
      entry.lineCode,
      system?.label ?? entry.label,
      system?.sortOrder ?? entry.row,
      entry.amountCells[0] ?? null,
      externalMinorOf(entry.amountCells[0]),
      system?.amountMinor ?? null,
    );
  }
  // 系统有行而 workbook 缺失：sourceSheet/sourceCell 为 null。
  for (const system of systemLines) {
    pushRow(system.lineCode, system.label, system.sortOrder, null, null, system.amountMinor);
  }

  rows.sort((a, b) => a.sortOrder - b.sortOrder || a.lineCode.localeCompare(b.lineCode));
  return rows;
}
