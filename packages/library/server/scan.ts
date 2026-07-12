/**
 * 资料库扫描服务：只读 LIBRARY_SOURCE_ROOT，把不可变版本和 manifest 写入 LIBRARY_ROOT。
 */
import { prisma } from "@workspace/platform/server/prisma";

import { getDefaultRoot, getDefaultSourceRoot, safeResolve } from "./config";
import { buildScanLibraryCommand } from "./domain/scan-validation";
import { LibraryScanFileError, processLibraryScanFile } from "./scan-file";
import {
  collectLibraryScanFiles,
  writeLibraryScanManifest,
  type ScanManifestEntry,
} from "./scan-manifest";

export interface ScanResult {
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  managedSkipped: number;
  missing: number;
  duplicates: number;
  manifestUid: string | null;
  manifestChecksumSha256: string | null;
  changedVersionUids: string[];
  errors: string[];
}

function emptyResult(error?: string): ScanResult {
  return {
    scanned: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    managedSkipped: 0,
    missing: 0,
    duplicates: 0,
    manifestUid: null,
    manifestChecksumSha256: null,
    changedVersionUids: [],
    errors: error ? [error] : [],
  };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function markMissingDocuments(rootKey: string, scannedStableKeys: Set<string>) {
  const oldActiveDocs = await prisma.libraryDocument.findMany({
    where: { rootKey, status: "active", origin: "scanned" },
    select: { id: true, stableKey: true, documentUid: true },
  });
  const missing = oldActiveDocs.filter((document) => !scannedStableKeys.has(document.stableKey));
  for (const document of missing) {
    await prisma.libraryDocument.update({ where: { id: document.id }, data: { status: "missing" } });
  }
  const allMissing = await prisma.libraryDocument.findMany({
    where: { rootKey, status: "missing", origin: "scanned" },
    select: { documentUid: true },
    orderBy: { documentUid: "asc" },
  });
  return allMissing.map((document) => document.documentUid);
}

function failedEntry(info: Awaited<ReturnType<typeof collectLibraryScanFiles>>["files"][number], error: unknown): ScanManifestEntry {
  return {
    relativePath: info.relativePath,
    fileName: info.fileName,
    extension: info.extension,
    mimeType: info.mimeType,
    sizeBytes: info.size,
    sourceModifiedAt: info.mtime.toISOString(),
    checksumSha256: null,
    status: "failed",
    errorCode: error instanceof LibraryScanFileError ? error.code : "scan_file_failed",
    errorMessage: errorText(error),
  };
}

export async function scanLibrary(rootKey?: string): Promise<ScanResult> {
  const command = buildScanLibraryCommand(rootKey);
  if (!command.ok) return emptyResult(command.issue.message);

  const sourceRoot = getDefaultSourceRoot();
  const runtimeRoot = getDefaultRoot();
  if (!sourceRoot) return emptyResult("LIBRARY_SOURCE_ROOT not set");
  if (!runtimeRoot) return emptyResult("LIBRARY_ROOT not set");
  const source = safeResolve("", sourceRoot);
  const runtime = safeResolve("", runtimeRoot);
  if (!source) return emptyResult(`Invalid source root: ${sourceRoot}`);
  if (!runtime) return emptyResult(`Invalid runtime root: ${runtimeRoot}`);
  if (source === runtime) return emptyResult("LIBRARY_SOURCE_ROOT and LIBRARY_ROOT must be different directories");

  const result = emptyResult();
  const collection = await collectLibraryScanFiles(source);
  for (const issue of collection.errors) {
    result.errors.push(`${issue.errorCode} ${issue.relativePath}: ${issue.message}`);
  }

  const entries: ScanManifestEntry[] = [];
  for (const info of collection.files) {
    result.scanned += 1;
    try {
      const entry = await processLibraryScanFile(command.data.rootKey, info);
      entries.push(entry);
      if (entry.status === "created") result.created += 1;
      if (entry.status === "updated") result.updated += 1;
      if ((entry.status === "created" || entry.status === "updated") && entry.versionUid) {
        result.changedVersionUids.push(entry.versionUid);
      }
      if (entry.status === "unchanged") result.unchanged += 1;
      if (entry.status === "managed-skip") result.managedSkipped += 1;
      if (entry.duplicateOfVersionUid) result.duplicates += 1;
    } catch (error) {
      entries.push(failedEntry(info, error));
      result.errors.push(`${info.relativePath}: ${errorText(error)}`);
    }
  }

  let missingDocumentUids: string[] = [];
  if (collection.errors.length === 0) {
    const scannedStableKeys = new Set(collection.files.map((info) => `${command.data.rootKey}:${info.relativePath}`));
    try {
      missingDocumentUids = await markMissingDocuments(command.data.rootKey, scannedStableKeys);
      result.missing = missingDocumentUids.length;
    } catch (error) {
      result.errors.push(`missing_check_failed: ${errorText(error)}`);
    }
  } else {
    result.errors.push("missing_check_skipped: source collection was incomplete");
  }

  try {
    const manifest = await writeLibraryScanManifest({
      root: runtime,
      rootKey: command.data.rootKey,
      entries,
      directoryErrors: collection.errors,
      missingDocumentUids,
    });
    result.manifestUid = manifest.manifestUid;
    result.manifestChecksumSha256 = manifest.checksumSha256;
  } catch (error) {
    result.errors.push(`manifest_write_failed: ${errorText(error)}`);
  }

  return result;
}
