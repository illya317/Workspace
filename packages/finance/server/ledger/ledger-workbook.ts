import * as XLSX from "xlsx";
import {
  formulaAwareSheet,
  type FinanceWorkbookCell,
} from "../workbook-formula-contract";

export interface LedgerWorkbookColumn {
  header: string;
  width: number;
  numeric?: boolean;
}

export interface LedgerWorkbookInput {
  sheetName: string;
  columns: LedgerWorkbookColumn[];
  rows: FinanceWorkbookCell[][];
}

const AMOUNT_FORMAT = "#,##0.00;[Red]-#,##0.00;0";

export function buildLedgerWorkbook(input: LedgerWorkbookInput): Buffer {
  const worksheet = formulaAwareSheet([
    input.columns.map((column) => column.header),
    ...input.rows,
  ]);
  worksheet["!cols"] = input.columns.map((column) => ({ wch: column.width }));
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: Math.max(0, input.rows.length), c: input.columns.length - 1 }),
  };
  worksheet["!margins"] = {
    left: 0.3,
    right: 0.3,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  };
  for (let row = 1; row <= input.rows.length; row += 1) {
    input.columns.forEach((column, columnIndex) => {
      if (!column.numeric) return;
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: columnIndex })];
      if (cell && typeof cell.v === "number") cell.z = AMOUNT_FORMAT;
    });
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, input.sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
