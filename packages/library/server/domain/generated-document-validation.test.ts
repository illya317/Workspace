import assert from "node:assert/strict";
import test from "node:test";

import { buildGeneratedDocumentCommand } from "./generated-document-validation";

const input = {
  generatorKey: "finance-report",
  title: "最新已验证财务报表",
  confidentialityLevel: 2,
  userId: 1,
};

test("approved generated document requires source verification time", () => {
  const result = buildGeneratedDocumentCommand(input, {
    fileName: "财务报表.xlsx",
    title: "2025.12 已验证财务报表",
    content: Buffer.from("workbook"),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    identityKey: "latest-verified-financial-statements",
    asOfDate: "2025-12-31",
    reviewStatus: "approved",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "verifiedAt");
});

test("verified generated document keeps its canonical identity and cutoff", () => {
  const result = buildGeneratedDocumentCommand(input, {
    fileName: "财务报表.xlsx",
    title: "2025.12 已验证财务报表",
    content: Buffer.from("workbook"),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    identityKey: "latest-verified-financial-statements",
    asOfDate: "2025-12-31",
    verifiedAt: "2026-07-21T04:07:30.024Z",
    reviewStatus: "approved",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.output.identityKey, "latest-verified-financial-statements");
    assert.equal(result.data.output.asOfDate, "2025-12-31");
  }
});
