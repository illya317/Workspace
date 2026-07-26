import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import { buildLedgerWorkbook } from "./ledger-workbook";

test("builds a filterable single-sheet ledger workbook and preserves numeric zero", () => {
  const buffer = buildLedgerWorkbook({
    sheetName: "应付",
    columns: [
      { header: "供应商名称", width: 32 },
      { header: "期初借方", width: 16, numeric: true },
      { header: "期初贷方", width: 16, numeric: true },
    ],
    rows: [["供应商甲", 0, 1234.5]],
  });
  const workbook = XLSX.read(buffer, { type: "buffer", cellNF: true });
  const worksheet = workbook.Sheets["应付"]!;
  const rows = XLSX.utils.sheet_to_json<Array<string | number>>(worksheet, { header: 1, raw: true });

  assert.deepEqual(workbook.SheetNames, ["应付"]);
  assert.deepEqual(rows, [
    ["供应商名称", "期初借方", "期初贷方"],
    ["供应商甲", 0, 1234.5],
  ]);
  assert.equal(worksheet.B2?.z, "#,##0.00;[Red]-#,##0.00;0");
  assert.deepEqual(worksheet["!autofilter"], { ref: "A1:C2" });
});
