/**
 * 窄 ZIP central-directory 元数据读取器（计划 §5.2「自写窄工具」方案）。
 *
 * 选择自写而非新增依赖的理由：
 * - 只需要 EOCD / ZIP64 EOCD / central directory 的声明元数据（文件名、声明压缩/解压
 *   大小、flags、method），完全不解压、不读 local data；新增依赖的许可与供应链成本
 *   不成比例。
 * - jszip 目前只是传递依赖，直接 import 传递依赖被明确禁止。
 * - 读取面窄、输入全部按 offset 越界检查，配套单测覆盖畸形 EOCD、ZIP64、伪造声明
 *   大小、multi-disk、条目数不符等对抗形状。
 *
 * 该读取器不做任何信任假设：所有声明值只是「声明」，限额判断由 preflight.ts 完成。
 */

export type ZipMetadataErrorCode =
  | "eocd_not_found"
  | "multi_disk"
  | "zip64_locator_missing"
  | "zip64_eocd_malformed"
  | "central_directory_out_of_bounds"
  | "entry_malformed"
  | "entry_count_mismatch"
  | "size_overflow";

export class ZipMetadataError extends Error {
  readonly name = "ZipMetadataError";
  readonly code: ZipMetadataErrorCode;

  constructor(code: ZipMetadataErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface ZipEntryMetadata {
  /** central directory 里的原始文件名（utf-8 解码，不规范化路径）。 */
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  /** 压缩方法（0=stored, 8=deflate, ...）。 */
  method: number;
  /** general purpose bit flags（bit 0 = encrypted, bit 11 = utf-8 name）。 */
  flags: number;
}

export interface ZipArchiveMetadata {
  entries: ZipEntryMetadata[];
  /** 全部 entry 声明解压大小之和（safe integer）。 */
  totalDeclaredUncompressed: number;
  zip64: boolean;
}

const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_SIGNATURE = 0x06064b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const EOCD_MIN_LENGTH = 22;
const EOCD64_MIN_LENGTH = 56;
const CENTRAL_ENTRY_FIXED_LENGTH = 46;
const MAX_COMMENT_LENGTH = 0xffff;
const ZIP64_EXTRA_ID = 0x0001;

function readUInt16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUInt32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

/** 读 8 字节 little-endian 为 safe integer；超出 safe integer 范围即 fail closed。 */
function readUInt64Safe(bytes: Uint8Array, offset: number, code: ZipMetadataErrorCode): number {
  const low = readUInt32(bytes, offset);
  const high = readUInt32(bytes, offset + 4);
  if (high > 0x1fffff) {
    throw new ZipMetadataError(code, "ZIP64 数值超出 safe integer 范围");
  }
  const value = high * 0x100000000 + low;
  if (!Number.isSafeInteger(value)) {
    throw new ZipMetadataError(code, "ZIP64 数值超出 safe integer 范围");
  }
  return value;
}

/** 从末尾向前定位 EOCD；要求 comment 恰好填满到 EOF，拒绝尾随垃圾伪造。 */
function locateEndOfCentralDirectory(bytes: Uint8Array): number {
  if (bytes.length < EOCD_MIN_LENGTH) {
    throw new ZipMetadataError("eocd_not_found", "文件太小，不包含 EOCD");
  }
  const earliest = Math.max(0, bytes.length - EOCD_MIN_LENGTH - MAX_COMMENT_LENGTH);
  for (let pos = bytes.length - EOCD_MIN_LENGTH; pos >= earliest; pos -= 1) {
    if (readUInt32(bytes, pos) !== EOCD_SIGNATURE) continue;
    const commentLength = readUInt16(bytes, pos + 20);
    if (pos + EOCD_MIN_LENGTH + commentLength === bytes.length) {
      return pos;
    }
  }
  throw new ZipMetadataError("eocd_not_found", "找不到合法的 EOCD 记录");
}

interface CentralDirectoryPointer {
  entryCount: number;
  size: number;
  offset: number;
  zip64: boolean;
}

function resolveCentralDirectoryPointer(bytes: Uint8Array, eocdOffset: number): CentralDirectoryPointer {
  const diskNumber = readUInt16(bytes, eocdOffset + 4);
  const centralDisk = readUInt16(bytes, eocdOffset + 6);
  const diskEntries = readUInt16(bytes, eocdOffset + 8);
  const totalEntries = readUInt16(bytes, eocdOffset + 10);
  const size32 = readUInt32(bytes, eocdOffset + 12);
  const offset32 = readUInt32(bytes, eocdOffset + 16);

  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    throw new ZipMetadataError("multi_disk", "拒绝 multi-disk ZIP 归档");
  }

  const needsZip64 = totalEntries === 0xffff || size32 === 0xffffffff || offset32 === 0xffffffff;
  if (!needsZip64) {
    return { entryCount: totalEntries, size: size32, offset: offset32, zip64: false };
  }

  const locatorOffset = eocdOffset - 20;
  if (locatorOffset < 0 || readUInt32(bytes, locatorOffset) !== EOCD64_LOCATOR_SIGNATURE) {
    throw new ZipMetadataError("zip64_locator_missing", "EOCD 标记需要 ZIP64 但缺少 locator");
  }
  if (readUInt32(bytes, locatorOffset + 4) !== 0 || readUInt32(bytes, locatorOffset + 16) !== 1) {
    throw new ZipMetadataError("multi_disk", "拒绝 multi-disk ZIP64 归档");
  }
  const zip64EocdOffset = readUInt64Safe(bytes, locatorOffset + 8, "size_overflow");
  if (zip64EocdOffset + EOCD64_MIN_LENGTH > bytes.length) {
    throw new ZipMetadataError("zip64_eocd_malformed", "ZIP64 EOCD 越界");
  }
  if (readUInt32(bytes, zip64EocdOffset) !== EOCD64_SIGNATURE) {
    throw new ZipMetadataError("zip64_eocd_malformed", "ZIP64 EOCD 签名错误");
  }
  const entryCount = readUInt64Safe(bytes, zip64EocdOffset + 32, "size_overflow");
  const size = readUInt64Safe(bytes, zip64EocdOffset + 40, "size_overflow");
  const offset = readUInt64Safe(bytes, zip64EocdOffset + 48, "size_overflow");
  return { entryCount, size, offset, zip64: true };
}

const nameDecoder = new TextDecoder("utf-8", { fatal: false });

function parseCentralEntry(
  bytes: Uint8Array,
  offset: number,
): { entry: ZipEntryMetadata; nextOffset: number } {
  if (offset + CENTRAL_ENTRY_FIXED_LENGTH > bytes.length) {
    throw new ZipMetadataError("entry_malformed", "central directory entry 越界");
  }
  if (readUInt32(bytes, offset) !== CENTRAL_ENTRY_SIGNATURE) {
    throw new ZipMetadataError("entry_malformed", "central directory entry 签名错误");
  }
  const flags = readUInt16(bytes, offset + 8);
  const method = readUInt16(bytes, offset + 10);
  let compressedSize = readUInt32(bytes, offset + 20);
  let uncompressedSize = readUInt32(bytes, offset + 24);
  const nameLength = readUInt16(bytes, offset + 28);
  const extraLength = readUInt16(bytes, offset + 30);
  const commentLength = readUInt16(bytes, offset + 32);
  const diskStart = readUInt16(bytes, offset + 34);
  if (diskStart !== 0) {
    throw new ZipMetadataError("multi_disk", "拒绝 multi-disk ZIP 归档");
  }
  const variableLength = nameLength + extraLength + commentLength;
  const nextOffset = offset + CENTRAL_ENTRY_FIXED_LENGTH + variableLength;
  if (nextOffset > bytes.length) {
    throw new ZipMetadataError("entry_malformed", "central directory entry 可变字段越界");
  }

  // ZIP64 extra field 0x0001：仅当对应 32 位字段为 0xFFFFFFFF 时按序出现
  // （uncompressed → compressed → local header offset → disk start）。
  if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff) {
    const extraStart = offset + CENTRAL_ENTRY_FIXED_LENGTH + nameLength;
    const extraEnd = extraStart + extraLength;
    let cursor = extraStart;
    let resolved = false;
    while (cursor + 4 <= extraEnd) {
      const fieldId = readUInt16(bytes, cursor);
      const fieldSize = readUInt16(bytes, cursor + 2);
      const fieldStart = cursor + 4;
      if (fieldStart + fieldSize > extraEnd) {
        throw new ZipMetadataError("entry_malformed", "ZIP64 extra field 越界");
      }
      if (fieldId === ZIP64_EXTRA_ID) {
        let valueCursor = fieldStart;
        const valueEnd = fieldStart + fieldSize;
        if (uncompressedSize === 0xffffffff) {
          if (valueCursor + 8 > valueEnd) break;
          uncompressedSize = readUInt64Safe(bytes, valueCursor, "size_overflow");
          valueCursor += 8;
        }
        if (compressedSize === 0xffffffff) {
          if (valueCursor + 8 > valueEnd) {
            throw new ZipMetadataError("entry_malformed", "ZIP64 extra field 长度不足");
          }
          compressedSize = readUInt64Safe(bytes, valueCursor, "size_overflow");
        }
        resolved = true;
        break;
      }
      cursor = fieldStart + fieldSize;
    }
    if (!resolved) {
      throw new ZipMetadataError("entry_malformed", "声明 ZIP64 大小但缺少 ZIP64 extra field");
    }
  }

  const name = nameDecoder.decode(
    bytes.subarray(offset + CENTRAL_ENTRY_FIXED_LENGTH, offset + CENTRAL_ENTRY_FIXED_LENGTH + nameLength),
  );
  return { entry: { name, compressedSize, uncompressedSize, method, flags }, nextOffset };
}

/**
 * 读取 ZIP 归档的 central directory 声明元数据。不解压任何 entry。
 * 任何结构畸形（伪造 EOCD、缺失 ZIP64、越界 offset、条目数不符）都 fail closed。
 */
export function readZipMetadata(bytes: Uint8Array): ZipArchiveMetadata {
  const eocdOffset = locateEndOfCentralDirectory(bytes);
  const pointer = resolveCentralDirectoryPointer(bytes, eocdOffset);
  if (pointer.offset + pointer.size > eocdOffset) {
    throw new ZipMetadataError(
      "central_directory_out_of_bounds",
      "central directory 声明区间越界或与 EOCD 重叠",
    );
  }

  const entries: ZipEntryMetadata[] = [];
  let cursor = pointer.offset;
  const directoryEnd = pointer.offset + pointer.size;
  for (let index = 0; index < pointer.entryCount; index += 1) {
    if (cursor >= directoryEnd) {
      throw new ZipMetadataError("entry_count_mismatch", "central directory 条目数少于声明值");
    }
    const { entry, nextOffset } = parseCentralEntry(bytes, cursor);
    if (nextOffset > directoryEnd) {
      throw new ZipMetadataError("entry_malformed", "central directory entry 超出声明区间");
    }
    entries.push(entry);
    cursor = nextOffset;
  }
  if (entries.length !== pointer.entryCount) {
    throw new ZipMetadataError("entry_count_mismatch", "central directory 条目数与声明值不符");
  }

  let totalDeclaredUncompressed = 0;
  for (const entry of entries) {
    totalDeclaredUncompressed += entry.uncompressedSize;
    if (!Number.isSafeInteger(totalDeclaredUncompressed)) {
      throw new ZipMetadataError("size_overflow", "声明解压总量超出 safe integer 范围");
    }
  }

  return { entries, totalDeclaredUncompressed, zip64: pointer.zip64 };
}
