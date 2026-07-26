import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import { authoritativeArtifactOutput, fitGeneratedWorkbook } from "./authoritative-source";

test("authoritative artifact keeps the summary concise and evidence out of display text", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["项目", "金额"]]), "报表");
  const output = authoritativeArtifactOutput({
    sourceKey: "finance-report",
    ownerUnitId: "finance",
    identityKey: "standalone-01",
    title: "单体财务报表",
    summary: "2025.12 单体财务报表。",
    fileName: "单体.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    contentBase64: (XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer).toString("base64"),
    asOfDate: "2025-12-31",
    verifiedAt: "2026-07-21T04:07:30.024Z",
    evidence: ["output-sha256:secret-provenance"],
  });

  assert.equal(output.summary, "2025.12 单体财务报表。");
  assert.equal(output.summary?.includes("output-sha256"), false);
});

test("generated workbook expands narrow columns and caps very long content", () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["项目", "本期金额"],
    ["一、营业收入以及需要完整显示的财务报表项目", 12070.81],
    ["超长".repeat(100), 0],
  ]);
  worksheet["!cols"] = [{ wch: 4 }, { wch: 4 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "利润表");

  const fitted = XLSX.read(fitGeneratedWorkbook(
    XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
  ), { type: "buffer", cellStyles: true });
  const columns = fitted.Sheets["利润表"]?.["!cols"];

  assert.ok((columns?.[0]?.width ?? 0) > (columns?.[1]?.width ?? 0));
  assert.ok((columns?.[0]?.wch ?? 0) <= 50);
  assert.ok((columns?.[1]?.wch ?? 0) >= 12);
});
