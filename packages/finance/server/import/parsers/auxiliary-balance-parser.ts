import * as xlsx from "xlsx";

import {
  detectBalanceDirection,
  detectCategory,
  fixRowEncoding,
  getParentCode,
  parseAmount,
  type AuxiliaryDimensionType,
  type PreviewAccount,
  type PreviewAuxiliaryBalance,
  type PreviewResult,
} from "../shared";

interface ColumnIndexes {
  accountCode: number;
  accountName: number;
  dimensionCode: number;
  dimensionName: number;
  openingDirection: number;
  openingAmount: number;
  currentDebit: number;
  currentCredit: number;
  closingDirection: number;
  closingAmount: number;
}

export function parseAuxiliaryBalanceSheet(
  buffer: Buffer,
  companyCode: string,
  year: number,
  sourceFileName: string,
  fileExt?: string,
): PreviewResult {
  const workbook = xlsx.read(buffer, { type: "buffer", codepage: fileExt === ".xls" ? 936 : undefined });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
  const rows = rawRows.map((row) => fixRowEncoding(Array.isArray(row) ? row : []));
  const errors: string[] = [];
  const warnings: string[] = [];
  const headerRow = findHeaderRow(rows);
  if (headerRow < 0) {
    return emptyResult(companyCode, year, sourceFileName, errors.concat("无法识别辅助余额表头"));
  }

  const headers = rows[headerRow].map((value) => String(value ?? "").trim());
  const dimensionType = detectDimensionType(headers, sourceFileName);
  const fallback = fallbackAccount(sourceFileName);
  const columns = locateColumns(headers);
  if (!dimensionType || columns.dimensionCode < 0 || columns.dimensionName < 0 || columns.closingDirection < 0 || columns.closingAmount < 0) {
    return emptyResult(companyCode, year, sourceFileName, errors.concat("辅助余额表缺少核算对象、期末方向或期末余额列"));
  }
  if (columns.accountCode < 0 && !fallback) {
    return emptyResult(companyCode, year, sourceFileName, errors.concat("辅助余额表缺少科目编码，且无法从文件名推断科目"));
  }

  const auxiliaryBalances: PreviewAuxiliaryBalance[] = [];
  const accountMap = new Map<string, PreviewAccount>();
  for (let index = headerRow + 1; index < rows.length; index++) {
    const row = rows[index];
    const dimensionCode = cellText(row, columns.dimensionCode);
    const dimensionName = cellText(row, columns.dimensionName);
    if (!dimensionCode || !dimensionName || dimensionCode.includes("合计") || dimensionName.includes("合计")) continue;

    const accountCode = columns.accountCode >= 0 ? cellText(row, columns.accountCode).replace(/\.0$/, "") : fallback!.code;
    const accountName = columns.accountName >= 0 ? cellText(row, columns.accountName) : fallback!.name;
    if (!accountCode || accountCode.includes("合计")) continue;
    const opening = sideAmounts(cellText(row, columns.openingDirection), parseAt(row, columns.openingAmount));
    const closing = sideAmounts(cellText(row, columns.closingDirection), parseAt(row, columns.closingAmount));
    auxiliaryBalances.push({
      accountCode,
      accountName,
      dimensionType,
      dimensionCode,
      dimensionName,
      openingDebit: opening.debit,
      openingCredit: opening.credit,
      currentDebit: parseAt(row, columns.currentDebit),
      currentCredit: parseAt(row, columns.currentCredit),
      closingDebit: closing.debit,
      closingCredit: closing.credit,
    });
    if (!accountMap.has(accountCode)) {
      accountMap.set(accountCode, {
        code: accountCode,
        name: accountName,
        parentCode: getParentCode(accountCode),
        category: detectCategory(accountCode, accountName),
        balanceDirection: detectBalanceDirection(accountCode, accountName),
      });
    }
  }

  if (auxiliaryBalances.length === 0) warnings.push("辅助余额表没有可导入的明细行");
  return {
    type: "auxiliary",
    companyCode,
    year,
    month: inferMonth(sourceFileName),
    sourceFileName,
    rows: auxiliaryBalances.length,
    accounts: [...accountMap.values()],
    auxiliaryBalances,
    errors,
    warnings,
  };
}

function findHeaderRow(rows: unknown[][]): number {
  return rows.slice(0, 10).findIndex((row) => row.some((value) => String(value ?? "").includes("期末余额")));
}

function locateColumns(headers: string[]): ColumnIndexes {
  const directions = headers.flatMap((value, index) => value.includes("方向") ? [index] : []);
  return {
    accountCode: findColumn(headers, ["科目编码"]),
    accountName: findColumn(headers, ["科目名称"]),
    dimensionCode: findColumn(headers, ["供应商编号", "客户编号", "个人编码"]),
    dimensionName: findColumn(headers, ["供应商名称", "客户名称", "个人名称"]),
    openingDirection: directions[0] ?? -1,
    openingAmount: findColumn(headers, ["期初余额"]),
    currentDebit: findColumn(headers, ["本期借方发生", "借方本币"]),
    currentCredit: findColumn(headers, ["本期贷方发生", "贷方本币"]),
    closingDirection: directions.at(-1) ?? -1,
    closingAmount: findColumn(headers, ["期末余额"]),
  };
}

function findColumn(headers: string[], labels: string[]): number {
  return headers.findIndex((header) => labels.some((label) => header.includes(label)));
}

function detectDimensionType(headers: string[], fileName: string): AuxiliaryDimensionType | null {
  const text = `${headers.join("|")}|${fileName}`;
  if (text.includes("供应商")) return "supplier";
  if (text.includes("客户")) return "customer";
  if (text.includes("个人")) return "person";
  return null;
}

function fallbackAccount(fileName: string): { code: string; name: string } | null {
  if (fileName.includes("应收个人")) return { code: "122102", name: "其他应收款-个人" };
  if (fileName.includes("应付个人")) return { code: "224102", name: "其他应付款-个人" };
  return null;
}

function inferMonth(fileName: string): number {
  const explicit = fileName.match(/20\d{2}[.-](\d{1,2})/);
  if (!explicit) return 12;
  const month = Number(explicit[1]);
  return month >= 1 && month <= 12 ? month : 12;
}

function sideAmounts(direction: string, amount: number): { debit: number; credit: number } {
  if (direction.startsWith("借")) return { debit: amount, credit: 0 };
  if (direction.startsWith("贷")) return { debit: 0, credit: amount };
  return { debit: 0, credit: 0 };
}

function parseAt(row: unknown[], index: number): number {
  return index >= 0 ? parseAmount(row[index]) : 0;
}

function cellText(row: unknown[], index: number): string {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

function emptyResult(companyCode: string, year: number, sourceFileName: string, errors: string[]): PreviewResult {
  return { type: "auxiliary", companyCode, year, month: inferMonth(sourceFileName), sourceFileName, rows: 0, accounts: [], auxiliaryBalances: [], errors, warnings: [] };
}
