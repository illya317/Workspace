import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import XLSX from "xlsx";
import {
  aliasesForRecord,
  archiveRoleCode,
  normalizeExternalPartyName,
  parseExternalPartyMasterWorkbook,
  stableProvisionalCode,
  temporaryArchiveIdentity,
  temporarySharedIdentity,
  temporaryShipmentIdentity,
} from "./external-party-master-source.mjs";

// The SheetJS ESM build does not bind Node fs; readFile/writeFile require an explicit binding.
XLSX.set_fs(fs);

test("normalizes source aliases and produces deterministic namespaced role codes", () => {
  assert.equal(normalizeExternalPartyName(" 广东　医药 有限公司 "), "广东医药有限公司");
  assert.equal(archiveRoleCode("customer", "04", "0012"), "CUS-04-0012");
  assert.equal(archiveRoleCode("supplier", "04", "0012"), "SUP-04-0012");
  assert.equal(stableProvisionalCode("04", "甲公司"), stableProvisionalCode("04", " 甲 公司 "));
  assert.equal(temporaryArchiveIdentity("customer", "04", "0012"), "TEMP-CUS-04-0012");
  assert.match(temporarySharedIdentity("04", "甲公司"), /^TEMP-EXT-04-[A-F0-9]{12}$/);
  assert.match(temporaryShipmentIdentity("04", "甲公司"), /^TEMP-CUS-04-SHP-[A-F0-9]{12}$/);
});

test("parses customer archive fields with stable source provenance", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "external-party-master-"));
  const filePath = path.join(directory, "客户档案.XLS");
  try {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["客户编码", "客户名称", "客户简称", "联系人", "电话", "地区名称", "税率%"],
      ["0012", "广东医药有限公司", "广东医药", "张三", "020-1", "广东", "13"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "sheet1");
    XLSX.writeFile(workbook, filePath, { bookType: "xls" });

    const records = parseExternalPartyMasterWorkbook(filePath, "customer");
    assert.equal(records.length, 1);
    assert.deepEqual({
      code: records[0].code,
      displayName: records[0].displayName,
      legalName: records[0].legalName,
      sourceKey: records[0].sourceKey,
      sourceRow: records[0].sourceRow,
      taxRate: records[0].taxRate,
    }, {
      code: "0012",
      displayName: "广东医药",
      legalName: "广东医药有限公司",
      sourceKey: "code:0012",
      sourceRow: 2,
      taxRate: 13,
    });
    assert.deepEqual(aliasesForRecord(records[0]), ["广东医药", "广东医药有限公司"]);
    assert.equal("identityNumber" in records[0], false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
