import { createHash } from "node:crypto";

import {
  defaultWorkbookIngestLimits,
  type WorkbookIngestLimits,
} from "./limits";
import { readZipMetadata, ZipMetadataError } from "./zip-metadata";

/**
 * 上传 envelope + archive preflight（计划 §5.2）。
 *
 * 铁律：本函数在完整 SheetJS parse 之前运行，且只读取字节数、ZIP magic 与
 * central directory 声明元数据，绝不解压。任何不变量失败都 fail closed，
 * 返回明确的 failureCode；扩展名/MIME 只是前置提示，永远不足以放行。
 */

export type WorkbookPreflightFailureCode =
  | "file_too_large"
  | "not_ooxml_zip"
  | "malformed_zip"
  | "multi_disk_archive"
  | "too_many_entries"
  | "declared_uncompressed_too_large"
  | "zip_bomb_ratio"
  | "encrypted_content"
  | "macro_content"
  | "external_links"
  | "ole_dde_content"
  | "missing_ooxml_parts";

export interface WorkbookScanSummary {
  sha256: string;
  byteLength: number;
  entryCount: number;
  declaredUncompressedBytes: number;
  zip64: boolean;
  /** preflight 通过后被排除/拒绝的结构说明（供审计与 UI 展示）。 */
  rejected: string[];
  warnings: string[];
}

export type WorkbookPreflightOutcome =
  | { ok: true; scan: WorkbookScanSummary }
  | { ok: false; failureCode: WorkbookPreflightFailureCode; message: string };

const ZIP_LOCAL_HEADER_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function fail(failureCode: WorkbookPreflightFailureCode, message: string): WorkbookPreflightOutcome {
  return { ok: false, failureCode, message };
}

/** 不安全内容判定基于 central directory 条目名（大小写不敏感）。 */
function classifyUnsafeEntryName(lowerName: string): WorkbookPreflightFailureCode | null {
  if (lowerName === "encryptioninfo" || lowerName === "encryptedpackage") return "encrypted_content";
  if (lowerName.endsWith("vbaproject.bin")) return "macro_content";
  if (lowerName.startsWith("xl/externallinks/") || lowerName.includes("/externallinks/")) {
    return "external_links";
  }
  if (
    lowerName.startsWith("xl/activex/")
    || lowerName.startsWith("xl/ctrlprops/")
    || lowerName.startsWith("xl/oleobjects/")
    || lowerName.startsWith("xl/embeddings/")
    || lowerName.includes("/activex/")
    || lowerName.includes("/oleobjects/")
  ) {
    return "ole_dde_content";
  }
  return null;
}

/**
 * 执行上传 envelope 与 archive 安全 preflight。
 * `bytes` 必须是已按 20 MiB 上限截取/校验过的完整文件字节；本函数再次断言，
 * 防御绕过 route 字节上限直接调 service 的调用方。
 */
export function preflightWorkbookUpload(
  bytes: Uint8Array,
  limits: WorkbookIngestLimits = defaultWorkbookIngestLimits(),
): WorkbookPreflightOutcome {
  // 1. 原始字节上限（§5.2 第 1 行；在 arrayBuffer() 之前由 route 强制，此处兜底）。
  if (bytes.byteLength > limits.maxUploadBytes) {
    return fail("file_too_large", `文件超过 ${limits.maxUploadBytes} 字节上限`);
  }

  // 2. OOXML ZIP magic（扩展名/MIME 不足以放行；MIME 伪造在此被拦截）。
  if (
    bytes.byteLength < ZIP_LOCAL_HEADER_MAGIC.length
    || ZIP_LOCAL_HEADER_MAGIC.some((value, index) => bytes[index] !== value)
  ) {
    return fail("not_ooxml_zip", "文件不是合法的 OOXML ZIP 归档");
  }

  // 3. central directory 声明元数据（不解压；结构畸形 fail closed）。
  let metadata;
  try {
    metadata = readZipMetadata(bytes);
  } catch (error) {
    if (error instanceof ZipMetadataError) {
      if (error.code === "multi_disk") return fail("multi_disk_archive", "拒绝 multi-disk ZIP 归档");
      return fail("malformed_zip", `ZIP 结构不合法：${error.message}`);
    }
    throw error;
  }

  // 4. 条目数与声明解压总量上限。
  if (metadata.entries.length > limits.maxArchiveEntries) {
    return fail("too_many_entries", `归档条目数超过 ${limits.maxArchiveEntries} 上限`);
  }
  if (metadata.totalDeclaredUncompressed > limits.maxDeclaredUncompressedBytes) {
    return fail(
      "declared_uncompressed_too_large",
      `声明解压总量超过 ${limits.maxDeclaredUncompressedBytes} 字节上限`,
    );
  }

  // 5. 逐 entry：加密标志与 zip-bomb 比率。
  for (const entry of metadata.entries) {
    if (entry.flags & 0x1) {
      return fail("encrypted_content", "归档包含加密条目");
    }
    if (
      entry.uncompressedSize > limits.entryRatioMinUncompressedBytes
      && entry.compressedSize > 0
      && entry.uncompressedSize / entry.compressedSize > limits.maxEntryCompressionRatio
    ) {
      return fail("zip_bomb_ratio", "条目压缩比异常，疑似 zip bomb");
    }
  }

  // 6. 不安全内容：宏 / 加密 / 外部链接 / DDE·OLE。
  const rejected: string[] = [];
  for (const entry of metadata.entries) {
    const failureCode = classifyUnsafeEntryName(entry.name.toLowerCase());
    if (failureCode) {
      rejected.push(entry.name);
      const messages: Record<string, string> = {
        encrypted_content: "拒绝加密工作簿",
        macro_content: "拒绝包含宏（vbaProject）的工作簿",
        external_links: "拒绝包含外部链接的工作簿",
        ole_dde_content: "拒绝包含 OLE/DDE/ActiveX 内容的工作簿",
      };
      return fail(failureCode, messages[failureCode] ?? "拒绝不安全的工作簿内容");
    }
  }

  // 7. OOXML 必需部件（[Content_Types].xml + xl/workbook.xml）。
  const names = new Set(metadata.entries.map((entry) => entry.name.toLowerCase()));
  if (!names.has("[content_types].xml") || !names.has("xl/workbook.xml")) {
    return fail("missing_ooxml_parts", "缺少 OOXML 必需部件（[Content_Types].xml / xl/workbook.xml）");
  }

  return {
    ok: true,
    scan: {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.byteLength,
      entryCount: metadata.entries.length,
      declaredUncompressedBytes: metadata.totalDeclaredUncompressed,
      zip64: metadata.zip64,
      rejected,
      warnings: [],
    },
  };
}
