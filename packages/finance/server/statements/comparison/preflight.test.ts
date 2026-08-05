import assert from "node:assert/strict";
import test from "node:test";

import { MAX_ARCHIVE_ENTRIES, MAX_UPLOAD_BYTES } from "./limits";
import { preflightWorkbookUpload } from "./preflight";
import { buildMinimalOoxmlZip, buildTestZip, type TestZipEntrySpec } from "./zip-test-fixtures";

function expectFailure(bytes: Uint8Array, failureCode: string) {
  const outcome = preflightWorkbookUpload(bytes);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failureCode, failureCode);
}

test("合法最小 OOXML 归档通过 preflight 并产出 scan 摘要", () => {
  const outcome = preflightWorkbookUpload(buildMinimalOoxmlZip());
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.scan.entryCount, 3);
    assert.match(outcome.scan.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(outcome.scan.rejected, []);
  }
});

test("超过 20 MiB 原始字节 → file_too_large（在 arrayBuffer/parse 之前拒绝）", () => {
  expectFailure(Buffer.alloc(MAX_UPLOAD_BYTES + 1), "file_too_large");
});

test("MIME/扩展名伪造：非 ZIP 内容 → not_ooxml_zip", () => {
  expectFailure(Buffer.from("%PDF-1.7 fake workbook content......"), "not_ooxml_zip");
});

test("ZIP magic 之后结构损坏 → malformed_zip", () => {
  const broken = Buffer.alloc(64);
  broken.writeUInt32LE(0x04034b50, 0);
  expectFailure(broken, "malformed_zip");
});

test("损坏 OOXML：缺 [Content_Types].xml → missing_ooxml_parts", () => {
  const zip = buildTestZip([{ name: "xl/workbook.xml" }, { name: "xl/worksheets/sheet1.xml" }]);
  expectFailure(zip, "missing_ooxml_parts");
});

test("条目数超过 2,000 → too_many_entries", () => {
  const entries: TestZipEntrySpec[] = [
    { name: "[Content_Types].xml" },
    { name: "xl/workbook.xml" },
  ];
  for (let index = 0; index < MAX_ARCHIVE_ENTRIES; index += 1) {
    entries.push({ name: `xl/filler/${index}.bin` });
  }
  expectFailure(buildTestZip(entries), "too_many_entries");
});

test("声明解压总量超过 100 MiB → declared_uncompressed_too_large", () => {
  const zip = buildTestZip([
    { name: "[Content_Types].xml" },
    { name: "xl/workbook.xml" },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(8), uncompressedSize: 101 * 1024 * 1024 },
  ]);
  expectFailure(zip, "declared_uncompressed_too_large");
});

test("zip-bomb 比率：小声明压缩大小 + 大声明解压大小 → zip_bomb_ratio", () => {
  const zip = buildTestZip([
    { name: "[Content_Types].xml" },
    { name: "xl/workbook.xml" },
    { name: "xl/worksheets/sheet1.xml", compressedSize: 1024, uncompressedSize: 2 * 1024 * 1024 },
  ]);
  expectFailure(zip, "zip_bomb_ratio");
});

test("宏：vbaProject.bin → macro_content", () => {
  expectFailure(buildMinimalOoxmlZip([{ name: "xl/vbaProject.bin" }]), "macro_content");
});

test("加密：EncryptionInfo 条目 → encrypted_content", () => {
  expectFailure(
    buildTestZip([{ name: "EncryptionInfo" }, { name: "EncryptedPackage" }]),
    "encrypted_content",
  );
});

test("加密：entry flags bit0 → encrypted_content", () => {
  expectFailure(
    buildMinimalOoxmlZip([{ name: "xl/worksheets/sheet2.xml", flags: 0x1 }]),
    "encrypted_content",
  );
});

test("外部链接：externalLink 部件 → external_links", () => {
  expectFailure(
    buildMinimalOoxmlZip([{ name: "xl/externalLinks/externalLink1.xml" }]),
    "external_links",
  );
});

test("DDE/OLE：oleObject/activeX/embedding → ole_dde_content", () => {
  expectFailure(buildMinimalOoxmlZip([{ name: "xl/oleObjects/oleObject1.xml" }]), "ole_dde_content");
  expectFailure(buildMinimalOoxmlZip([{ name: "xl/activeX/activeX1.xml" }]), "ole_dde_content");
  expectFailure(buildMinimalOoxmlZip([{ name: "xl/embeddings/oleObject1.xlsx" }]), "ole_dde_content");
});

test("multi-disk 归档 → multi_disk_archive", () => {
  const zip = buildMinimalOoxmlZip();
  zip.writeUInt16LE(2, zip.length - 22 + 4);
  expectFailure(zip, "multi_disk_archive");
});
