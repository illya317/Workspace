import * as XLSX from "xlsx";
import {
  formulaFromVisibleCalculation,
  formulaAwareSheet,
  workbookFormula,
  type FinanceWorkbookCell,
} from "../workbook-formula-contract";

import type {
  ConsolidatedOutputEntityAmount,
  ConsolidatedOutputLine,
  ConsolidatedReportOutputPackage,
  ConsolidatedStatementOutput,
} from "@workspace/finance/types";
import { statementLineFormula } from "./statement-workbook-formulas";

const SHEET_ORDER = ["balanceSheet", "incomeStatement", "cashFlow"] as const;
const SHEET_NAMES = ["资产负债表底稿", "利润表底稿", "现金流量表底稿"] as const;
const AMOUNT_FORMAT = "#,##0.00;[Red]-#,##0.00;;@";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function entities(report: ConsolidatedReportOutputPackage) {
  const byId = new Map<number, ConsolidatedOutputEntityAmount>();
  for (const statement of report.statements) {
    for (const line of statement.lines) {
      for (const entity of line.entityAmounts ?? []) {
        if (!byId.has(entity.entitySnapshotId)) byId.set(entity.entitySnapshotId, entity);
      }
    }
  }
  return [...byId.values()].sort((left, right) => {
    if (left.role !== right.role) return left.role === "parent" ? -1 : 1;
    return left.companyCode.localeCompare(right.companyCode, "zh-CN", { numeric: true });
  });
}

function combinedEntityAmounts(lines: readonly ConsolidatedOutputLine[]) {
  const byId = new Map<number, ConsolidatedOutputEntityAmount>();
  for (const entity of lines.flatMap((line) => line.entityAmounts ?? [])) {
    const current = byId.get(entity.entitySnapshotId);
    byId.set(entity.entitySnapshotId, current ? {
      ...current,
      amount: money(current.amount + entity.amount),
      previousAmount: money(current.previousAmount + entity.previousAmount),
    } : { ...entity });
  }
  return [...byId.values()];
}

function workpaperLines(statement: ConsolidatedStatementOutput) {
  if (statement.reportType === "incomeStatement") {
    const netProfit = statement.lines.find((line) => line.lineCode === "netProfit");
    const parent = statement.lines.find((line) => line.lineCode === "netProfitAttributableToParent");
    const nci = statement.lines.find((line) => line.lineCode === "netProfitAttributableToNci");
    if (netProfit?.entityAmounts && parent && nci) {
      return statement.lines.map((line) => {
        if (line === parent) return { ...line, entityAmounts: netProfit.entityAmounts?.map((entity) => ({ ...entity })) };
        if (line === nci) return {
          ...line,
          entityAmounts: netProfit.entityAmounts?.map((entity) => ({
            ...entity,
            amount: 0,
            previousAmount: 0,
            ...(entity.currentMonthAmount === undefined ? {} : { currentMonthAmount: 0 }),
          })),
        };
        return line;
      });
    }
    return statement.lines;
  }
  if (statement.reportType !== "balanceSheet" || statement.lines.some((line) => line.lineCode === "totalLiabilitiesAndEquity")) {
    return statement.lines;
  }
  const liabilities = statement.lines.find((line) => line.lineCode === "totalLiabilities");
  const equity = statement.lines.find((line) => line.lineCode === "totalEquity");
  if (!liabilities || !equity) return statement.lines;
  return [...statement.lines, {
    lineCode: "totalLiabilitiesAndEquity",
    label: "负债和所有者权益总计",
    code: null,
    amount: money(liabilities.amount + equity.amount),
    previousAmount: money(liabilities.previousAmount + equity.previousAmount),
    section: "equity",
    side: "credit" as const,
    direction: null,
    subtract: false,
    isHeader: false,
    isTotal: false,
    isGrandTotal: true,
    sourceAmount: money(liabilities.sourceAmount + equity.sourceAmount),
    adjustmentAmount: money(liabilities.adjustmentAmount + equity.adjustmentAmount),
    entityAmounts: combinedEntityAmounts([liabilities, equity]),
  }];
}

function adjustmentAmounts(line: ConsolidatedOutputLine) {
  const adjustment = money(line.adjustmentAmount);
  if (line.side === "credit") {
    return adjustment >= 0
      ? { debit: 0, credit: adjustment }
      : { debit: Math.abs(adjustment), credit: 0 };
  }
  return adjustment >= 0
    ? { debit: adjustment, credit: 0 }
    : { debit: 0, credit: Math.abs(adjustment) };
}

function buildSheet(
  report: ConsolidatedReportOutputPackage,
  statement: ConsolidatedStatementOutput,
  entityColumns: ConsolidatedOutputEntityAmount[],
) {
  const columnCount = entityColumns.length + 5;
  const lines = workpaperLines(statement);
  const rowByCode = new Map(lines.map((line, index) => [line.lineCode, index + 4]));
  const sourceColumn = XLSX.utils.encode_col(entityColumns.length + 1);
  const debitColumn = XLSX.utils.encode_col(entityColumns.length + 2);
  const creditColumn = XLSX.utils.encode_col(entityColumns.length + 3);
  const entityValuesByCode = new Map(entityColumns.map((entity) => [
    entity.entitySnapshotId,
    new Map(lines.map((line) => [
      line.lineCode,
      line.entityAmounts?.find((amount) => amount.entitySnapshotId === entity.entitySnapshotId)?.amount ?? 0,
    ])),
  ]));
  const rows: FinanceWorkbookCell[][] = [
    [`合并${statement.label}工作底稿`, ...Array.from({ length: columnCount - 1 }, () => "")],
    [
      `编制单位：${report.batch.parentCompanyName}`,
      ...Array.from({ length: Math.max(0, columnCount - 3) }, () => ""),
      `会计期间：${report.batch.year}.${String(report.batch.month).padStart(2, "0")}`,
      "单位：元",
    ],
    [
      "项目",
      ...entityColumns.map((entity) => `${entity.companyCode} ${entity.companyName}`),
      "个别报表合计",
      "抵销借方",
      "抵销贷方",
      "合并数",
    ],
    ...lines.map((line, index) => {
      const excelRow = index + 4;
      const adjustment = adjustmentAmounts(line);
      const entityAmounts = entityColumns.map((entity, entityIndex) => {
        const valuesByCode = entityValuesByCode.get(entity.entitySnapshotId)!;
        const amount = line.entityAmounts?.find((candidate) => (
          candidate.entitySnapshotId === entity.entitySnapshotId
        ))?.amount ?? 0;
        const formula = statementLineFormula({
          reportType: statement.reportType,
          line,
          lines,
          rowByCode,
          valueByCode: valuesByCode,
          cachedValue: amount,
          column: XLSX.utils.encode_col(entityIndex + 1),
          consolidated: true,
        });
        return formula ? workbookFormula(formula, amount) : amount;
      });
      const visibleEntityTotal = money(entityAmounts.reduce((sum, amount) => (
        sum + (typeof amount === "number" ? amount : amount.cachedValue)
      ), 0));
      const sourceAmount = !line.isHeader
        && entityColumns.length > 0
        ? workbookFormula(
          formulaFromVisibleCalculation(
            `SUM(B${excelRow}:${XLSX.utils.encode_col(entityColumns.length)}${excelRow})`,
            visibleEntityTotal,
            line.sourceAmount,
            `${statement.label}“${line.label}”个别报表合计`,
          ),
          line.sourceAmount,
        )
        : line.sourceAmount;
      const visibleCombinedAmount = money(line.side === "credit"
        ? line.sourceAmount - adjustment.debit + adjustment.credit
        : line.sourceAmount + adjustment.debit - adjustment.credit);
      const combinedExpression = line.side === "credit"
        ? `${sourceColumn}${excelRow}-${debitColumn}${excelRow}+${creditColumn}${excelRow}`
        : `${sourceColumn}${excelRow}+${debitColumn}${excelRow}-${creditColumn}${excelRow}`;
      return [
        line.label,
        ...entityAmounts,
        sourceAmount,
        adjustment.debit,
        adjustment.credit,
        line.isHeader
          ? line.amount
          : workbookFormula(
            formulaFromVisibleCalculation(
              combinedExpression,
              visibleCombinedAmount,
              line.amount,
              `${statement.label}“${line.label}”合并数`,
            ),
            line.amount,
          ),
      ];
    }),
  ];
  const worksheet = formulaAwareSheet(rows);
  worksheet["!merges"] = [XLSX.utils.decode_range(`A1:${XLSX.utils.encode_col(columnCount - 1)}1`)];
  worksheet["!cols"] = [
    { wch: 38 },
    ...entityColumns.map(() => ({ wch: 22 })),
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
  ];
  worksheet["!autofilter"] = { ref: `A3:${XLSX.utils.encode_col(columnCount - 1)}${rows.length}` };
  worksheet["!margins"] = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  for (let row = 4; row <= rows.length; row += 1) {
    for (let column = 2; column <= columnCount; column += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
      if (cell && typeof cell.v === "number") cell.z = AMOUNT_FORMAT;
    }
  }
  return worksheet;
}

export function buildConsolidationWorkpaperWorkbook(report: ConsolidatedReportOutputPackage): Buffer {
  const workbook = XLSX.utils.book_new();
  const entityColumns = entities(report);
  for (const [index, reportType] of SHEET_ORDER.entries()) {
    const statement = report.statements.find((candidate) => candidate.reportType === reportType);
    if (!statement) throw new Error(`缺少${SHEET_NAMES[index]}数据`);
    XLSX.utils.book_append_sheet(workbook, buildSheet(report, statement, entityColumns), SHEET_NAMES[index]);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function consolidationWorkpaperFilename(report: ConsolidatedReportOutputPackage) {
  const entity = report.batch.parentCompanyName.replace(/[\\/:*?"<>|]/g, "_");
  return `${entity}-${report.batch.year}.${String(report.batch.month).padStart(2, "0")}-合并工作底稿.xlsx`;
}
