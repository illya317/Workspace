import * as XLSX from "xlsx";

export interface FinanceWorkbookFormulaCell {
  kind: "formula";
  formula: string;
  cachedValue: number;
}

export type FinanceWorkbookCell = string | number | FinanceWorkbookFormulaCell;

/**
 * Formula export contract:
 * - derived backend values remain formulas in the downloaded workbook;
 * - reference every precedent that is visible in the workbook;
 * - preserve the backend result as the cached value;
 * - reject business amounts, rates, residuals, and other numeric plugs in formulas;
 * - permit only narrowly defined structural integers such as ROUND precision and small multipliers;
 * - keep source facts and procedural decisions as frozen backend values.
 */
export function workbookFormula(formula: string, cachedValue: number): FinanceWorkbookFormulaCell {
  if (!Number.isFinite(cachedValue)) throw new Error("Excel 公式缓存值必须是有限数字");
  const normalized = formula.trim().replace(/^=/, "");
  if (!normalized) throw new Error("Excel 公式不能为空");
  assertFinanceWorkbookFormula(normalized);
  return { kind: "formula", formula: normalized, cachedValue };
}

export function formulaFromVisibleCalculation(
  expression: string,
  visibleCalculatedValue: number,
  cachedValue: number,
  context = "派生金额",
) {
  assertFinite(visibleCalculatedValue, "Excel 公式可见计算值");
  assertFinite(cachedValue, "Excel 公式缓存值");
  const difference = money(cachedValue - visibleCalculatedValue);
  if (difference !== 0) {
    throw new Error(`${context}的可见公式与后台金额相差 ${difference.toFixed(2)}，禁止用数字常量补差`);
  }
  return `ROUND(${expression},2)`;
}

export function assertFinanceWorkbookFormula(formula: string) {
  const normalized = formula.trim().replace(/^=/, "");
  const violations = financeWorkbookFormulaHardcodedNumbers(normalized);
  if (violations.length === 0) return;
  throw new Error(`财务 Excel 公式禁止硬编码数字：${violations.map((item) => item.literal).join("、")}（${normalized}）`);
}

export function financeWorkbookFormulaHardcodedNumbers(formula: string) {
  const masked = maskFormulaReferencesAndStrings(formula);
  const violations: Array<{ literal: string; index: number }> = [];
  const numberPattern = /(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/g;
  for (const match of masked.matchAll(numberPattern)) {
    const literal = match[0];
    const index = match.index;
    if (isAllowedStructuralNumber(masked, literal, index)) continue;
    violations.push({ literal, index });
  }
  return violations;
}

export function formulaAwareSheet(rows: readonly (readonly FinanceWorkbookCell[])[]) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows.map((row) => row.map((cell) => (
    isFormulaCell(cell) ? cell.cachedValue : cell
  ))));
  rows.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
    if (!isFormulaCell(cell)) return;
    worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] = {
      t: "n",
      v: cell.cachedValue,
      f: cell.formula,
    };
  }));
  return worksheet;
}

function isFormulaCell(cell: FinanceWorkbookCell): cell is FinanceWorkbookFormulaCell {
  return typeof cell === "object" && cell.kind === "formula";
}

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label}必须是有限数字`);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function maskFormulaReferencesAndStrings(formula: string) {
  const mask = (value: string) => " ".repeat(value.length);
  return formula
    .replace(/"(?:""|[^"])*"/g, mask)
    .replace(/(?:'[^']+'|[A-Za-z_][A-Za-z0-9_.]*)!\$?[A-Za-z]{1,3}\$?\d+/g, mask)
    .replace(/\$?[A-Za-z]{1,3}\$?\d+/g, mask);
}

function isAllowedStructuralNumber(formula: string, literal: string, index: number) {
  const value = Number(literal);
  const integer = Number.isInteger(value);
  const previous = nearestNonWhitespace(formula, index - 1, -1);
  const next = nearestNonWhitespace(formula, index + literal.length, 1);
  const smallMultiplier = integer && value >= 1 && value <= 12;
  if (smallMultiplier && ["*", "/"].includes(previous)) return true;
  if (smallMultiplier && ["*", "/"].includes(next)) return true;
  const frame = formulaFrameAt(formula, index);
  if (integer && value <= 15 && frame?.argumentIndex === 1
    && ["ROUND", "ROUNDUP", "ROUNDDOWN", "TRUNC"].includes(frame.functionName)) {
    return true;
  }
  if (value === 0 && frame && ["MAX", "MIN"].includes(frame.functionName)) return true;
  if (value === 0 && ["=", "<", ">"].includes(previous)) return true;
  if (value === 0 && ["=", "<", ">"].includes(next)) return true;
  return false;
}

function nearestNonWhitespace(formula: string, start: number, direction: -1 | 1) {
  for (let index = start; index >= 0 && index < formula.length; index += direction) {
    if (!/\s/.test(formula[index]!)) return formula[index]!;
  }
  return "";
}

function formulaFrameAt(formula: string, targetIndex: number) {
  const stack: Array<{ functionName: string; argumentIndex: number }> = [];
  let pendingFunction = "";
  for (let index = 0; index < targetIndex;) {
    const char = formula[index]!;
    if (/[A-Za-z_]/.test(char)) {
      const match = formula.slice(index).match(/^[A-Za-z_][A-Za-z0-9_.]*/)?.[0] ?? "";
      pendingFunction = match.toUpperCase();
      index += match.length;
      continue;
    }
    if (char === "(") {
      stack.push({ functionName: pendingFunction, argumentIndex: 0 });
      pendingFunction = "";
    } else if (char === "," && stack.length > 0) {
      stack[stack.length - 1]!.argumentIndex += 1;
    } else if (char === ")") {
      stack.pop();
    } else if (!/\s/.test(char)) {
      pendingFunction = "";
    }
    index += 1;
  }
  return stack.at(-1) ?? null;
}
