import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDF_OPTIMIZATION_VERSION } from "@workspace/platform/pdf-optimization";
import { runValidatedPdfOptimization } from "@workspace/platform/server/pdf-optimization";
import { resolveTenantConfigPath } from "@workspace/platform/server/tenant-config";

const CONTRACT_ATTACHMENT_ROOT = "administration/contracts/attachments";

function checksum(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function attachmentDirectory(attachmentUid: string) {
  return path.posix.join(CONTRACT_ATTACHMENT_ROOT, attachmentUid);
}

function absolutePath(relativePath: string) {
  return resolveTenantConfigPath(relativePath);
}

async function writeExclusive(relativePath: string, buffer: Buffer) {
  const target = absolutePath(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, buffer, { flag: "wx", mode: 0o600 });
    await link(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function storeContractAttachment(input: {
  attachmentUid: string;
  fileName: string;
  buffer: Buffer;
}) {
  const extension = path.extname(input.fileName).toLowerCase();
  const directory = attachmentDirectory(input.attachmentUid);
  const originalStoragePath = path.posix.join(directory, `original${extension}`);
  const originalChecksumSha256 = checksum(input.buffer);
  await writeExclusive(originalStoragePath, input.buffer);

  const base = {
    originalStoragePath,
    originalSizeBytes: input.buffer.length,
    originalChecksumSha256,
    optimizedStoragePath: null as string | null,
    optimizedSizeBytes: null as number | null,
    optimizedChecksumSha256: null as string | null,
    optimizationStatus: "not_applicable" as "not_applicable" | "optimized" | "retained_original" | "failed",
    optimizationError: null as string | null,
    compressionSavingsRatio: null as number | null,
    pageCount: null as number | null,
  };
  if (extension !== ".pdf") return base;

  const optimizedDirectory = path.posix.join(directory, `optimized-${PDF_OPTIMIZATION_VERSION}`);
  try {
    const result = await runValidatedPdfOptimization({
      inputPath: absolutePath(originalStoragePath),
      outputDir: absolutePath(optimizedDirectory),
      inputChecksum: originalChecksumSha256,
      pipelineVersion: PDF_OPTIMIZATION_VERSION,
      skipThumbnail: true,
    });
    const preview = result.artifacts.find((artifact) => artifact.kind === "preview-pdf");
    if (!preview) throw new Error("PDF optimization did not produce a preview artifact");
    return {
      ...base,
      optimizedStoragePath: path.posix.join(optimizedDirectory, preview.fileName),
      optimizedSizeBytes: preview.fileSizeBytes,
      optimizedChecksumSha256: preview.checksumSha256,
      optimizationStatus: result.compressionRetained ? "optimized" as const : "retained_original" as const,
      compressionSavingsRatio: result.compressionSavingsRatio,
      pageCount: result.pageCount,
    };
  } catch (error) {
    return {
      ...base,
      optimizationStatus: "failed" as const,
      optimizationError: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
    };
  }
}

export async function removeUncommittedContractAttachment(attachmentUid: string) {
  await rm(absolutePath(attachmentDirectory(attachmentUid)), { recursive: true, force: true }).catch(() => undefined);
}

export async function readContractAttachmentFile(input: {
  storagePath: string;
  expectedSizeBytes: number;
  expectedChecksumSha256: string;
}) {
  const filePath = absolutePath(input.storagePath);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile() || fileStat.size !== input.expectedSizeBytes) throw new Error("合同附件文件校验失败");
  const buffer = await readFile(filePath);
  if (checksum(buffer) !== input.expectedChecksumSha256) throw new Error("合同附件校验和不匹配");
  return buffer;
}
