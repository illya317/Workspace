import path from "node:path";
import XLSX from "xlsx";

const MONTHLY_SHEET_NAME = /^(?<shortYear>\d{2})\.(?<month>\d{1,2})月?$/;
const PRODUCT_STATUSES = new Set(["产成品", "在产品"]);

const COST_COLUMNS = [
  ["rawMaterials", 3],
  ["packagingMaterials", 4],
  ["wage", 5],
  ["directLaborSocialSecurity", 6],
  ["directLaborWelfare", 7],
  ["auxiliaryLaborWage", 8],
  ["auxiliaryLaborSocialSecurity", 9],
  ["auxiliaryLaborWelfare", 10],
  ["utilities", 11],
  ["depreciationDirect", 12],
  ["depreciationAuxiliary", 13],
  ["otherManufacturingCost", 14],
  ["manufacturingSubtotal", 15],
];

function text(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number"
    ? value
    : Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseMonthlyCostSheet(rows, { sourceFile, sheetName, year, month }) {
  const standardRows = [];
  let currentStatus = null;
  let dataStarted = false;

  // The source contract is the first large table: five header rows, followed by
  // one contiguous product block. The first empty product-name row ends it.
  for (let rowIndex = 5; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const productName = text(row[1]);

    if (!productName) {
      if (dataStarted) break;
      continue;
    }
    dataStarted = true;

    const explicitStatus = text(row[0]);
    if (PRODUCT_STATUSES.has(explicitStatus)) currentStatus = explicitStatus;
    if (!PRODUCT_STATUSES.has(currentStatus)) continue;

    const cost = Object.fromEntries(
      COST_COLUMNS.map(([field, columnIndex]) => [field, number(row[columnIndex])]),
    );

    standardRows.push({
      productStatus: currentStatus,
      productName,
      workHours: number(row[2]),
      cost,
      inboundQuantity: number(row[16]),
      source: {
        file: sourceFile,
        sheet: sheetName,
        row: rowIndex + 1,
      },
      sourceSheetKind: "monthly-cost",
      year,
      month,
    });
  }

  return standardRows;
}

export function normalizeCostStructureWorkbook(filePath) {
  const sourceFile = path.basename(filePath);
  const workbook = XLSX.readFile(filePath, { codepage: 936, cellDates: false });
  const standardRows = [];
  let workbookYear = null;

  for (const sheetName of workbook.SheetNames) {
    const match = MONTHLY_SHEET_NAME.exec(sheetName);
    if (!match?.groups) continue;

    const year = 2000 + Number.parseInt(match.groups.shortYear, 10);
    const month = Number.parseInt(match.groups.month, 10);
    if (month < 1 || month > 12) continue;
    workbookYear ??= year;

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    standardRows.push(...parseMonthlyCostSheet(rows, {
      sourceFile,
      sheetName,
      year,
      month,
    }));
  }

  return {
    profile: "cost-structure",
    sourceFile,
    year: workbookYear,
    tables: [],
    standardRows,
  };
}
