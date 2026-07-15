import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubmitStatementSourcePackageCommand,
  buildUploadStatementSourcePackageCommand,
} from "./statement-source-validation";

function workbookFile(name = "三表.xlsx", size = 4) {
  return new File([new Uint8Array(size)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

test("statement source upload normalizes a valid human decision command", () => {
  const result = buildUploadStatementSourcePackageCommand({
    file: workbookFile(),
    companyCode: " 02 ",
    year: 2026,
    month: 12,
    note: "  已核对编制单位  ",
  }, 7);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.companyCode, "02");
  assert.equal(result.data.note, "已核对编制单位");
});

test("statement source upload rejects non workbook evidence and invalid periods", () => {
  const wrongFile = buildUploadStatementSourcePackageCommand({
    file: workbookFile("三表.csv"),
    companyCode: "02",
    year: 2026,
    month: 12,
  }, 7);
  assert.equal(wrongFile.ok, false);
  const wrongPeriod = buildUploadStatementSourcePackageCommand({
    file: workbookFile(),
    companyCode: "02",
    year: 2026,
    month: 13,
  }, 7);
  assert.equal(wrongPeriod.ok, false);
});

test("statement source submit requires optimistic version and a valid actor", () => {
  assert.equal(buildSubmitStatementSourcePackageCommand(3, { expectedVersion: 2 }, 7).ok, true);
  assert.equal(buildSubmitStatementSourcePackageCommand(3, { expectedVersion: 0 }, 7).ok, false);
  assert.equal(buildSubmitStatementSourcePackageCommand(3, { expectedVersion: 2 }, 0).ok, false);
});
