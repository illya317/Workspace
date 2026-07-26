import * as XLSX from "xlsx";

import {
  BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL,
  BALANCE_SHEET_CURRENT_AMOUNT_LABEL,
  FLOW_STATEMENT_COMPARATIVE_AMOUNT_LABEL,
  FLOW_STATEMENT_CURRENT_AMOUNT_LABEL,
  formatStatementPeriodEndLabel,
} from "../../types/statement-period";
import type {
  StatementPageData,
  StatementPageLine,
  StatementPageStatement,
} from "./statement-page-data";

const SHEET_ORDER = ["balanceSheet", "incomeStatement", "cashFlow"] as const;
const SHEET_NAMES = ["资产负债表", "利润表", "现金流量表"] as const;
const AMOUNT_FORMAT = "#,##0.00;[Red]-#,##0.00;;@";

function statementByType(data: StatementPageData, reportType: typeof SHEET_ORDER[number]) {
  const statement = data.statements.find((candidate) => candidate.reportType === reportType);
  if (!statement) throw new Error(`缺少${SHEET_NAMES[SHEET_ORDER.indexOf(reportType)]}数据`);
  return statement;
}

function reportTitle(mode: StatementPageData["mode"], reportType: typeof SHEET_ORDER[number]) {
  if (reportType === "balanceSheet") return mode === "consolidated" ? "合并资产负债表" : "资产负债表";
  if (reportType === "incomeStatement") return mode === "consolidated" ? "合并利润表" : "利润表";
  return mode === "consolidated" ? "合并现金流量表" : "现金流量表";
}

function displayAmount(line: StatementPageLine | undefined, period: "previous" | "current") {
  if (!line || line.isHeader) return "";
  return period === "previous" ? line.previousAmount : line.amount;
}

function setAmountFormats(worksheet: XLSX.WorkSheet, columns: number[], firstRow: number, lastRow: number) {
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (const column of columns) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
      if (cell && typeof cell.v === "number") cell.z = AMOUNT_FORMAT;
    }
  }
}

function applySheetDefaults(worksheet: XLSX.WorkSheet) {
  worksheet["!margins"] = {
    left: 0.3,
    right: 0.3,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  };
  worksheet["!rows"] = [{ hpt: 28 }, { hpt: 21 }, { hpt: 22 }];
}

function liabilityEquityGrandTotal(statement: StatementPageStatement): StatementPageLine {
  const totalLiabilities = statement.lines.find((line) => line.lineCode === "totalLiabilities");
  const totalEquity = statement.lines.find((line) => line.lineCode === "totalEquity");
  return {
    lineCode: "totalLiabilitiesAndEquity",
    code: null,
    label: "负债和所有者权益总计",
    amount: statement.totals.totalLiabilitiesAndEquity
      ?? (totalLiabilities?.amount ?? 0) + (totalEquity?.amount ?? 0),
    previousAmount: statement.totals.previousTotalLiabilitiesAndEquity
      ?? (totalLiabilities?.previousAmount ?? 0) + (totalEquity?.previousAmount ?? 0),
    section: "equity",
    side: "credit",
    direction: null,
    subtract: false,
    isHeader: false,
    isTotal: false,
    isGrandTotal: true,
  };
}

function buildBalanceSheet(data: StatementPageData, statement: StatementPageStatement) {
  const assets = statement.lines.filter((line) => line.side === "debit");
  const liabilitiesAndEquity = statement.lines.filter((line) => line.side === "credit");
  if (!liabilitiesAndEquity.some((line) => line.lineCode === "totalLiabilitiesAndEquity")) {
    liabilitiesAndEquity.push(liabilityEquityGrandTotal(statement));
  }
  const rows: Array<Array<string | number>> = [
    [reportTitle(data.mode, "balanceSheet"), "", "", "", "", ""],
    [`编制单位：${data.scope.companyName}`, "", "", formatStatementPeriodEndLabel(data.scope), "", "单位：元"],
    [
      "资产",
      BALANCE_SHEET_CURRENT_AMOUNT_LABEL,
      BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL,
      "负债和所有者权益（或股东权益）",
      BALANCE_SHEET_CURRENT_AMOUNT_LABEL,
      BALANCE_SHEET_COMPARATIVE_AMOUNT_LABEL,
    ],
  ];
  const lineCount = Math.max(assets.length, liabilitiesAndEquity.length);
  for (let index = 0; index < lineCount; index += 1) {
    const asset = assets[index];
    const liability = liabilitiesAndEquity[index];
    rows.push([
      asset?.label ?? "",
      displayAmount(asset, "current"),
      displayAmount(asset, "previous"),
      liability?.label ?? "",
      displayAmount(liability, "current"),
      displayAmount(liability, "previous"),
    ]);
  }
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!merges"] = [
    XLSX.utils.decode_range("A1:F1"),
    XLSX.utils.decode_range("A2:C2"),
    XLSX.utils.decode_range("D2:E2"),
  ];
  worksheet["!cols"] = [
    { wch: 34 }, { wch: 16 }, { wch: 16 },
    { wch: 38 }, { wch: 16 }, { wch: 16 },
  ];
  applySheetDefaults(worksheet);
  setAmountFormats(worksheet, [2, 3, 5, 6], 4, rows.length);
  return worksheet;
}

function buildFlowSheet(
  data: StatementPageData,
  statement: StatementPageStatement,
  reportType: "incomeStatement" | "cashFlow",
) {
  const rows: Array<Array<string | number>> = [
    [reportTitle(data.mode, reportType), "", ""],
    [`编制单位：${data.scope.companyName}`, `${data.scope.year}年${data.scope.month}月`, "单位：元"],
    [
      "项目",
      FLOW_STATEMENT_CURRENT_AMOUNT_LABEL,
      FLOW_STATEMENT_COMPARATIVE_AMOUNT_LABEL,
    ],
    ...statement.lines.map((line) => [
      line.label,
      displayAmount(line, "current"),
      displayAmount(line, "previous"),
    ]),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!merges"] = [
    XLSX.utils.decode_range("A1:C1"),
  ];
  worksheet["!cols"] = [{ wch: 50 }, { wch: 18 }, { wch: 18 }];
  applySheetDefaults(worksheet);
  setAmountFormats(worksheet, [2, 3], 4, rows.length);
  return worksheet;
}

export function buildStatementWorkbook(data: StatementPageData): Buffer {
  const workbook = XLSX.utils.book_new();
  const balance = statementByType(data, "balanceSheet");
  const income = statementByType(data, "incomeStatement");
  const cashFlow = statementByType(data, "cashFlow");
  XLSX.utils.book_append_sheet(workbook, buildBalanceSheet(data, balance), SHEET_NAMES[0]);
  XLSX.utils.book_append_sheet(workbook, buildFlowSheet(data, income, "incomeStatement"), SHEET_NAMES[1]);
  XLSX.utils.book_append_sheet(workbook, buildFlowSheet(data, cashFlow, "cashFlow"), SHEET_NAMES[2]);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function statementWorkbookFilename(data: StatementPageData) {
  const label = data.mode === "consolidated" ? "合并报表" : "财务报表";
  const entity = data.scope.companyName.replace(/[\\/:*?"<>|]/g, "_");
  return `${entity}-${data.scope.year}.${String(data.scope.month).padStart(2, "0")}-${label}.xlsx`;
}
