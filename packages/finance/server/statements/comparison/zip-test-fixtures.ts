/**
 * 测试专用最小 ZIP 构造器：只生成 store 方法的 local header + central directory + EOCD，
 * 字段可任意伪造（声明大小、条目数、ZIP64、multi-disk 等），用于 zip-metadata/preflight
 * 的对抗形状测试。仅服务测试，不参与任何运行时路径。
 */

export interface TestZipEntrySpec {
  name: string;
  /** 声明压缩/解压大小；默认等于 data 长度。 */
  compressedSize?: number;
  uncompressedSize?: number;
  method?: number;
  flags?: number;
  data?: Buffer;
  /** central directory 32 位大小字段写 0xFFFFFFFF 并附 ZIP64 extra。 */
  zip64Sizes?: boolean;
}

export interface TestZipOptions {
  comment?: Buffer;
  eocd?: Partial<{
    diskNumber: number;
    centralDisk: number;
    diskEntries: number;
    totalEntries: number;
    cdSize: number;
    cdOffset: number;
  }>;
  /** 写 ZIP64 EOCD + locator（EOCD 计数字段自动置 0xFFFF）。 */
  zip64?: boolean;
  /** 少写 N 个 central entry（条目数不符攻击）。 */
  omitEntries?: number;
  /** central directory 末尾追加字节（区间越界攻击）。 */
  cdPadding?: number;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_SIGNATURE = 0x06064b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;

export function buildTestZip(entries: TestZipEntrySpec[], options: TestZipOptions = {}): Buffer {
  const chunks: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = entry.data ?? Buffer.alloc(0);
    const compressedSize = entry.compressedSize ?? data.length;
    const uncompressedSize = entry.uncompressedSize ?? data.length;
    const method = entry.method ?? 0;
    const flags = entry.flags ?? 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressedSize === 0xffffffff ? 0xffffffff : compressedSize, 18);
    local.writeUInt32LE(uncompressedSize === 0xffffffff ? 0xffffffff : uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, data);

    let extra = Buffer.alloc(0);
    let cdCompressed = compressedSize;
    let cdUncompressed = uncompressedSize;
    if (entry.zip64Sizes) {
      extra = Buffer.alloc(4 + 16);
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(16, 2);
      // 顺序：uncompressed → compressed（两个 32 位字段都置 0xFFFFFFFF）。
      extra.writeBigUInt64LE(BigInt(uncompressedSize), 4);
      extra.writeBigUInt64LE(BigInt(compressedSize), 12);
      cdCompressed = 0xffffffff;
      cdUncompressed = 0xffffffff;
    }

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_ENTRY_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(cdCompressed, 20);
    central.writeUInt32LE(cdUncompressed, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(Buffer.concat([central, name, extra]));

    offset += local.length + name.length + data.length;
  }

  const omitted = options.omitEntries ?? 0;
  const writtenRecords = centralRecords.slice(0, Math.max(0, centralRecords.length - omitted));
  const cdOffset = offset;
  const cdBuffer = Buffer.concat(writtenRecords);
  const cdSize = cdBuffer.length + (options.cdPadding ?? 0);
  chunks.push(cdBuffer);
  if (options.cdPadding) chunks.push(Buffer.alloc(options.cdPadding));

  const comment = options.comment ?? Buffer.alloc(0);
  const useZip64 = options.zip64 === true;

  if (useZip64) {
    const zip64EocdOffset = cdOffset + cdSize;
    const zip64 = Buffer.alloc(56);
    zip64.writeUInt32LE(EOCD64_SIGNATURE, 0);
    zip64.writeBigUInt64LE(BigInt(44), 4); // record size after this field
    zip64.writeUInt16LE(45, 12);
    zip64.writeUInt16LE(45, 14);
    // +24 本盘条目数（8），+32 总条目数（8），+40 CD 大小（8），+48 CD 偏移（8）。
    zip64.writeBigUInt64LE(BigInt(entries.length), 24);
    zip64.writeBigUInt64LE(BigInt(entries.length), 32);
    zip64.writeBigUInt64LE(BigInt(cdSize), 40);
    zip64.writeBigUInt64LE(BigInt(cdOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(EOCD64_LOCATOR_SIGNATURE, 0);
    locator.writeUInt32LE(0, 4);
    locator.writeBigUInt64LE(BigInt(zip64EocdOffset), 8);
    locator.writeUInt32LE(1, 16);
    chunks.push(zip64, locator);
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(options.eocd?.diskNumber ?? 0, 4);
  eocd.writeUInt16LE(options.eocd?.centralDisk ?? 0, 6);
  eocd.writeUInt16LE(
    options.eocd?.diskEntries ?? (useZip64 ? 0xffff : entries.length),
    8,
  );
  eocd.writeUInt16LE(
    options.eocd?.totalEntries ?? (useZip64 ? 0xffff : entries.length),
    10,
  );
  eocd.writeUInt32LE(options.eocd?.cdSize ?? (useZip64 ? 0xffffffff : cdSize), 12);
  eocd.writeUInt32LE(options.eocd?.cdOffset ?? (useZip64 ? 0xffffffff : cdOffset), 16);
  eocd.writeUInt16LE(comment.length, 20);
  chunks.push(eocd, comment);

  return Buffer.concat(chunks);
}

/** 合法的最小 OOXML 形状（[Content_Types].xml + xl/workbook.xml）。 */
export function buildMinimalOoxmlZip(extraEntries: TestZipEntrySpec[] = []): Buffer {
  return buildTestZip([
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "xl/workbook.xml", data: Buffer.from("<workbook/>") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from("<worksheet/>") },
    ...extraEntries,
  ]);
}
