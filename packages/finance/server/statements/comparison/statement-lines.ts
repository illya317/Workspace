import { BALANCE_SHEET_LINES } from "../config/balance-sheet-lines";
import { CASH_FLOW_LINES } from "../config/cash-flow-lines";
import { INCOME_STATEMENT_LINES } from "../config/income-statement-lines";

/**
 * canonical 报表行词表（计划 §5.4）：三表共用现有 canonical statement line
 * configs 的 lineCode + label。匹配一律走 normalizeStatementLabel 后的
 * exact 比较；不做模糊/LLM 匹配。
 */

export type StatementReportType = "balance" | "income" | "cashflow";

export interface CanonicalStatementLine {
  lineCode: string;
  label: string;
  normalizedLabel: string;
  sortOrder: number;
  isHeader: boolean;
  isTotal: boolean;
  isGrandTotal: boolean;
}

const ENUMERATION_PREFIX = /^(?:[一二三四五六七八九十]+[、.．]|（[一二三四五六七八九十]+）|\([一二三四五六七八九十]+\)|[（(]\d+[)）]|\d+[、.．])/;
const QUANTIFIER_PREFIX = /^(?:减|加|其中)[:：]/;

/**
 * 报表 label 归一化：NFKC、去全部空白（含全角）、剥枚举/加减/其中前缀、
 * 去尾部冒号。只用于 exact 匹配，不产生近似匹配。
 */
export function normalizeStatementLabel(raw: string): string {
  let text = raw.normalize("NFKC");
  text = text.replace(/[　\s]+/g, "");
  // 前缀可叠加（如 "一、减：营业成本" 的变体），循环剥离。
  for (;;) {
    const next = text.replace(ENUMERATION_PREFIX, "").replace(QUANTIFIER_PREFIX, "");
    if (next === text) break;
    text = next;
  }
  return text.replace(/[:：]+$/, "");
}

function buildLines(): Record<StatementReportType, CanonicalStatementLine[]> {
  const balance: CanonicalStatementLine[] = BALANCE_SHEET_LINES.map((line, index) => ({
    lineCode: line.lineCode,
    label: line.label,
    normalizedLabel: normalizeStatementLabel(line.label),
    sortOrder: index,
    isHeader: line.isHeader === true,
    isTotal: line.isTotal === true,
    isGrandTotal: line.isGrandTotal === true,
  }));
  const income: CanonicalStatementLine[] = INCOME_STATEMENT_LINES.map((line, index) => ({
    lineCode: line.lineCode,
    label: line.label,
    normalizedLabel: normalizeStatementLabel(line.label),
    sortOrder: index,
    isHeader: line.isHeader === true,
    isTotal: line.isTotal === true,
    isGrandTotal: line.isGrandTotal === true,
  }));
  const cashflow: CanonicalStatementLine[] = CASH_FLOW_LINES.map((line, index) => ({
    lineCode: line.lineCode,
    label: line.label,
    normalizedLabel: normalizeStatementLabel(line.label),
    sortOrder: index,
    isHeader: line.isHeader === true,
    isTotal: line.isSubtotal === true,
    isGrandTotal: line.isGrandTotal === true,
  }));
  return { balance, income, cashflow };
}

const CANONICAL_LINES = buildLines();

export function canonicalLinesForReportType(reportType: StatementReportType): readonly CanonicalStatementLine[] {
  return CANONICAL_LINES[reportType];
}

export const STATEMENT_REPORT_TYPES: readonly StatementReportType[] = ["balance", "income", "cashflow"];

/** 归一化后发生碰撞的 canonical 行（同 label 多行）：映射时一律视为歧义。 */
export function collidingNormalizedLabels(reportType: StatementReportType): Set<string> {
  const counts = new Map<string, number>();
  for (const line of CANONICAL_LINES[reportType]) {
    counts.set(line.normalizedLabel, (counts.get(line.normalizedLabel) ?? 0) + 1);
  }
  const colliding = new Set<string>();
  for (const [label, count] of counts) {
    if (count > 1) colliding.add(label);
  }
  return colliding;
}
