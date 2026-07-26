import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import { renderSpreadsheetPreviewHtml } from "./spreadsheet-preview";

test("renderSpreadsheetPreviewHtml renders workbook rows and escapes cell content", () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["合同名称", "状态"],
    ["研发服务 <一期>", "执行中"],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "合同台账");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const html = renderSpreadsheetPreviewHtml({ buffer, title: "合同台账" });

  assert.match(html, /合同台账/);
  assert.match(html, /研发服务 &lt;一期&gt;/);
  assert.doesNotMatch(html, /研发服务 <一期>/);
  assert.match(html, /执行中/);
});
