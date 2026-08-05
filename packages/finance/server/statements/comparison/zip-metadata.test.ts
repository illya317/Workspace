import assert from "node:assert/strict";
import test from "node:test";

import { readZipMetadata, ZipMetadataError } from "./zip-metadata";
import { buildMinimalOoxmlZip, buildTestZip } from "./zip-test-fixtures";

test("读取合法 ZIP 的 central directory 声明元数据", () => {
  const zip = buildMinimalOoxmlZip();
  const metadata = readZipMetadata(zip);
  assert.equal(metadata.zip64, false);
  assert.deepEqual(
    metadata.entries.map((entry) => entry.name),
    ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"],
  );
  assert.equal(metadata.entries[0]!.uncompressedSize, "<Types/>".length);
  assert.equal(metadata.totalDeclaredUncompressed, "<Types/><workbook/><worksheet/>".length);
});

test("EOCD 缺失/文件太小 → eocd_not_found", () => {
  assert.throws(() => readZipMetadata(Buffer.alloc(10)), (error: unknown) => {
    assert.ok(error instanceof ZipMetadataError);
    assert.equal(error.code, "eocd_not_found");
    return true;
  });
  assert.throws(() => readZipMetadata(Buffer.from("not a zip at all, just some text padding......")), ZipMetadataError);
});

test("EOCD comment 长度与尾随字节不符 → eocd_not_found（防尾随伪造）", () => {
  const zip = buildMinimalOoxmlZip();
  const tampered = Buffer.concat([zip, Buffer.from("trailing-garbage")]);
  assert.throws(() => readZipMetadata(tampered), (error: unknown) => {
    assert.ok(error instanceof ZipMetadataError);
    assert.equal(error.code, "eocd_not_found");
    return true;
  });
});

test("EOCD comment 合法时接受", () => {
  const zip = buildTestZip(
    [{ name: "[Content_Types].xml", data: Buffer.from("x") }, { name: "xl/workbook.xml" }],
    { comment: Buffer.from("archive comment") },
  );
  const metadata = readZipMetadata(zip);
  assert.equal(metadata.entries.length, 2);
});

test("multi-disk EOCD（磁盘号非零/计数不一致）→ multi_disk", () => {
  const byDiskNumber = buildMinimalOoxmlZip();
  byDiskNumber.writeUInt16LE(1, byDiskNumber.length - 22 + 4);
  assert.throws(() => readZipMetadata(byDiskNumber), (error: unknown) => {
    assert.ok(error instanceof ZipMetadataError);
    assert.equal(error.code, "multi_disk");
    return true;
  });

  const mismatchedCounts = buildTestZip(
    [{ name: "[Content_Types].xml" }, { name: "xl/workbook.xml" }],
    { eocd: { diskEntries: 1, totalEntries: 2 } },
  );
  assert.throws(() => readZipMetadata(mismatchedCounts), (error: unknown) => {
    assert.ok(error instanceof ZipMetadataError);
    assert.equal(error.code, "multi_disk");
    return true;
  });
});

test("ZIP64：EOCD 计数 0xFFFF + locator + ZIP64 EOCD 正常解析", () => {
  const zip = buildTestZip(
    [
      { name: "[Content_Types].xml", data: Buffer.from("abc") },
      { name: "xl/workbook.xml", zip64Sizes: true, data: Buffer.from("0123456789") },
    ],
    { zip64: true },
  );
  const metadata = readZipMetadata(zip);
  assert.equal(metadata.zip64, true);
  assert.equal(metadata.entries.length, 2);
  assert.equal(metadata.entries[1]!.uncompressedSize, 10);
  assert.equal(metadata.entries[1]!.compressedSize, 10);
});

test("EOCD 标记需要 ZIP64 但缺 locator → zip64_locator_missing", () => {
  const zip = buildTestZip(
    [{ name: "[Content_Types].xml" }, { name: "xl/workbook.xml" }],
    { eocd: { totalEntries: 0xffff, diskEntries: 0xffff } },
  );
  assert.throws(() => readZipMetadata(zip), (error: unknown) => {
    assert.ok(error instanceof ZipMetadataError);
    assert.equal(error.code, "zip64_locator_missing");
    return true;
  });
});

test("伪造声明解压大小（central directory 声明值被如实读出，由 preflight 限额拦截）", () => {
  const zip = buildTestZip([
    { name: "[Content_Types].xml" },
    { name: "xl/workbook.xml" },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(4), uncompressedSize: 90 * 1024 * 1024 },
  ]);
  const metadata = readZipMetadata(zip);
  assert.equal(metadata.entries[2]!.uncompressedSize, 90 * 1024 * 1024);
  assert.equal(metadata.totalDeclaredUncompressed, 90 * 1024 * 1024);
});

test("central directory 声明区间越界 → central_directory_out_of_bounds", () => {
  const zip = buildTestZip(
    [{ name: "[Content_Types].xml" }, { name: "xl/workbook.xml" }],
    { eocd: { cdOffset: 0, cdSize: 0 } },
  );
  assert.throws(() => readZipMetadata(zip), (error: unknown) => {
    assert.ok(error instanceof ZipMetadataError);
    assert.equal(error.code, "entry_count_mismatch");
    return true;
  });

  const overlapping = buildMinimalOoxmlZip();
  overlapping.writeUInt32LE(overlapping.length - 22 + 10 * 1024, overlapping.length - 22 + 16);
  assert.throws(() => readZipMetadata(overlapping), ZipMetadataError);
});

test("条目数不符（声明多于实际）→ entry_count_mismatch", () => {
  const zip = buildTestZip(
    [{ name: "[Content_Types].xml" }, { name: "xl/workbook.xml" }],
    { omitEntries: 1 },
  );
  assert.throws(() => readZipMetadata(zip), (error: unknown) => {
    assert.ok(error instanceof ZipMetadataError);
    assert.equal(error.code, "entry_count_mismatch");
    return true;
  });
});

test("central entry 签名损坏 → entry_malformed", () => {
  const zip = buildMinimalOoxmlZip();
  // 破坏第一个 central entry 的签名（跳过 local header + name + data）。
  const firstLocal = 30 + "[Content_Types].xml".length + "<Types/>".length;
  const secondLocal = 30 + "xl/workbook.xml".length + "<workbook/>".length;
  const thirdLocal = 30 + "xl/worksheets/sheet1.xml".length + "<worksheet/>".length;
  const cdStart = firstLocal + secondLocal + thirdLocal;
  zip.writeUInt32LE(0xdeadbeef, cdStart);
  assert.throws(() => readZipMetadata(zip), (error: unknown) => {
    assert.ok(error instanceof ZipMetadataError);
    assert.equal(error.code, "entry_malformed");
    return true;
  });
});

test("32 位声明 0xFFFFFFFF 但缺 ZIP64 extra → entry_malformed", () => {
  const zip = buildTestZip([
    { name: "[Content_Types].xml" },
    { name: "xl/workbook.xml" },
    { name: "xl/worksheets/sheet1.xml", compressedSize: 0xffffffff, uncompressedSize: 0xffffffff },
  ]);
  assert.throws(() => readZipMetadata(zip), (error: unknown) => {
    assert.ok(error instanceof ZipMetadataError);
    assert.equal(error.code, "entry_malformed");
    return true;
  });
});
