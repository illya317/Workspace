import { randomUUID } from "node:crypto";
import { access, stat } from "node:fs/promises";

import { prisma } from "@workspace/platform/server/prisma";

import { computeChecksumOrThrow } from "./checksum";
import { ensureLibraryCategory } from "./classification";
import { ensureLibraryDirectory } from "./directories";
import { getDefaultRoot, safeResolve } from "./config";
import { createLibraryDocumentIdentity } from "./domain/document-identity";
import { buildProcessLibraryScanFileCommand } from "./domain/scan-validation";
import type { ScanFileInfo, ScanManifestEntry } from "./scan-manifest";
import {
  copyManagedVersionFile,
  getManagedVersionPath,
  removeManagedVersionFile,
} from "./version-storage";

const normalizeDirPath = (value: string) => value === "." ? null : value;

export class LibraryScanFileError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "LibraryScanFileError";
  }
}

async function observeStableSource(info: ScanFileInfo) {
  const checksumSha256 = await computeChecksumOrThrow(info.absolutePath);
  const after = await stat(info.absolutePath);
  if (after.size !== info.size || Math.abs(after.mtimeMs - info.mtime.getTime()) > 1) {
    throw new LibraryScanFileError("source_changed", "Source changed while checksum was being calculated");
  }
  return checksumSha256;
}

async function findDuplicateVersion(checksumSha256: string, documentId?: number) {
  return prisma.libraryDocumentVersion.findFirst({
    where: {
      checksumSha256,
      ...(documentId ? { documentId: { not: documentId } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { versionUid: true },
  });
}

async function copyVerifiedVersion(input: {
  documentUid: string;
  versionUid: string;
  info: ScanFileInfo;
  checksumSha256: string;
  managedFileName?: string;
}) {
  const managedFile = await copyManagedVersionFile({
    documentUid: input.documentUid,
    versionUid: input.versionUid,
    fileName: input.managedFileName ?? input.info.fileName,
    sourceAbsolutePath: input.info.absolutePath,
  });
  try {
    const [managedChecksum, managedStat] = await Promise.all([
      computeChecksumOrThrow(managedFile.absolutePath),
      stat(managedFile.absolutePath),
    ]);
    if (managedChecksum !== input.checksumSha256 || managedStat.size !== input.info.size) {
      throw new LibraryScanFileError("managed_copy_mismatch", "Managed copy does not match source size/SHA256");
    }
    return managedFile;
  } catch (error) {
    await removeManagedVersionFile(managedFile);
    throw error;
  }
}

async function ensureManagedCurrentVersion(input: {
  documentUid: string;
  versionUid: string;
  storagePath: string;
  fileName: string;
  info: ScanFileInfo;
  checksumSha256: string;
}) {
  const expectedPath = getManagedVersionPath(input.documentUid, input.versionUid, input.fileName);
  if (input.storagePath !== expectedPath) {
    throw new LibraryScanFileError("managed_path_mismatch", "Current version storage path does not match its immutable identity");
  }
  const absolutePath = safeResolve(expectedPath, getDefaultRoot());
  if (!absolutePath) throw new LibraryScanFileError("managed_path_invalid", "Current version storage path is outside runtime root");
  try {
    await access(absolutePath);
    const [checksum, fileStat] = await Promise.all([computeChecksumOrThrow(absolutePath), stat(absolutePath)]);
    if (checksum !== input.checksumSha256 || fileStat.size !== input.info.size) {
      throw new LibraryScanFileError("managed_copy_mismatch", "Existing managed version does not match source size/SHA256");
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    await copyVerifiedVersion({
      documentUid: input.documentUid,
      versionUid: input.versionUid,
      info: input.info,
      checksumSha256: input.checksumSha256,
      managedFileName: input.fileName,
    });
  }
}

function documentFacts(info: ScanFileInfo, checksumSha256: string, preservePlacement = false) {
  return {
    fileName: info.fileName,
    extension: info.extension || null,
    mimeType: info.mimeType,
    fileSizeBytes: info.size,
    fileMtime: info.mtime,
    checksumSha256,
    ...(preservePlacement ? {} : { directoryPath: normalizeDirPath(info.directoryPath) }),
    status: "active",
  };
}

export async function processLibraryScanFile(rootKey: string, info: ScanFileInfo): Promise<ScanManifestEntry> {
  const validated = buildProcessLibraryScanFileCommand({
    rootKey,
    absolutePath: info.absolutePath,
    relativePath: info.relativePath,
    fileName: info.fileName,
    size: info.size,
  });
  if (!validated.ok) throw new LibraryScanFileError("invalid_scan_input", validated.issue.message);
  const stableKey = `${rootKey}:${info.relativePath}`;
  const checksumSha256 = await observeStableSource(info);
  const existing = await prisma.libraryDocument.findUnique({
    where: { stableKey },
    include: {
      currentVersion: {
        select: {
          versionUid: true,
          storagePath: true,
          fileName: true,
          artifacts: {
            where: { status: "ready", kind: { in: ["preview-pdf", "markdown"] } },
            select: { kind: true },
          },
        },
      },
    },
  });
  const preservePlacement = existing?.categorySource === "manual" && existing.currentDirectoryId !== null;
  const [currentDirectoryId, folderCategoryId] = await Promise.all([
    preservePlacement
      ? Promise.resolve(existing.currentDirectoryId)
      : ensureLibraryDirectory(rootKey, info.directoryPath, { scannedAt: new Date() }),
    ensureLibraryCategory(info.categoryCode, info.categoryName),
  ]);
  const duplicate = await findDuplicateVersion(checksumSha256, existing?.id);
  const base = {
    relativePath: info.relativePath,
    fileName: info.fileName,
    extension: info.extension,
    mimeType: info.mimeType,
    sizeBytes: info.size,
    sourceModifiedAt: info.mtime.toISOString(),
    checksumSha256,
    ...(duplicate ? { duplicateOfVersionUid: duplicate.versionUid } : {}),
  };

  if (existing?.origin !== undefined && existing.origin !== "scanned") {
    return {
      ...base,
      status: "managed-skip",
      documentUid: existing.documentUid,
      ...(existing.currentVersion ? { versionUid: existing.currentVersion.versionUid } : {}),
    };
  }

  if (existing && existing.checksumSha256 === checksumSha256 && existing.currentVersion) {
    const compactKinds = new Set(existing.currentVersion.artifacts.map((artifact) => artifact.kind));
    if (!(compactKinds.has("preview-pdf") && compactKinds.has("markdown"))) {
      await ensureManagedCurrentVersion({
        documentUid: existing.documentUid,
        versionUid: existing.currentVersion.versionUid,
        storagePath: existing.currentVersion.storagePath,
        fileName: existing.currentVersion.fileName,
        info,
        checksumSha256,
      });
    }
    await prisma.libraryDocument.update({
      where: { id: existing.id },
      data: {
        ...documentFacts(info, checksumSha256, preservePlacement),
        ...(preservePlacement ? {} : { currentDirectoryId }),
        ...(existing.categorySource === "manual" ? {} : { categoryId: folderCategoryId }),
      },
    });
    return {
      ...base,
      status: "unchanged",
      documentUid: existing.documentUid,
      versionUid: existing.currentVersion.versionUid,
    };
  }

  if (existing) {
    const latest = await prisma.libraryDocumentVersion.findFirst({
      where: { documentId: existing.id },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true },
    });
    const versionNo = (latest?.versionNo ?? 0) + 1;
    const versionUid = randomUUID();
    const managedFile = await copyVerifiedVersion({ documentUid: existing.documentUid, versionUid, info, checksumSha256 });
    try {
      await prisma.$transaction(async (tx) => {
        const version = await tx.libraryDocumentVersion.create({
          data: {
            versionUid,
            documentId: existing.id,
            versionNo,
            versionLabel: `V${versionNo}`,
            fileName: info.fileName,
            storagePath: managedFile.relativePath,
            storageFileName: info.fileName,
            storageMimeType: info.mimeType,
            storageFileSizeBytes: info.size,
            storageChecksumSha256: checksumSha256,
            relativePath: info.relativePath,
            extension: info.extension || null,
            mimeType: info.mimeType,
            fileSizeBytes: info.size,
            sourceModifiedAt: info.mtime,
            checksumSha256,
            changeNote: "Source content changed during scan",
          },
        });
        await tx.libraryDocument.update({
          where: { id: existing.id },
          data: {
            ...documentFacts(info, checksumSha256, preservePlacement),
            ...(preservePlacement ? {} : { currentDirectoryId }),
            ...(existing.categorySource === "manual" ? {} : { categoryId: folderCategoryId }),
            currentVersionId: version.id,
            version: versionNo,
            versionLabel: `V${versionNo}`,
          },
        });
      });
    } catch (error) {
      await removeManagedVersionFile(managedFile);
      throw error;
    }
    return { ...base, status: "updated", documentUid: existing.documentUid, versionUid };
  }

  const identity = createLibraryDocumentIdentity();
  const versionUid = randomUUID();
  const managedFile = await copyVerifiedVersion({ documentUid: identity.documentUid, versionUid, info, checksumSha256 });
  try {
    await prisma.$transaction(async (tx) => {
      const document = await tx.libraryDocument.create({
        data: {
          ...identity,
          stableKey,
          rootKey,
          relativePath: info.relativePath,
          ...documentFacts(info, checksumSha256),
          categoryCode: info.categoryCode || null,
          categoryName: info.categoryName || null,
          categoryId: folderCategoryId,
          currentDirectoryId,
          origin: "scanned",
          version: 1,
          versionLabel: "V1",
        },
      });
      const version = await tx.libraryDocumentVersion.create({
        data: {
          versionUid,
          documentId: document.id,
          versionNo: 1,
          versionLabel: "V1",
          fileName: info.fileName,
          storagePath: managedFile.relativePath,
          storageFileName: info.fileName,
          storageMimeType: info.mimeType,
          storageFileSizeBytes: info.size,
          storageChecksumSha256: checksumSha256,
          relativePath: info.relativePath,
          extension: info.extension || null,
          mimeType: info.mimeType,
          fileSizeBytes: info.size,
          sourceModifiedAt: info.mtime,
          checksumSha256,
          changeNote: "Initial scanned version",
        },
      });
      await tx.libraryDocument.update({ where: { id: document.id }, data: { currentVersionId: version.id } });
    });
  } catch (error) {
    await removeManagedVersionFile(managedFile);
    throw error;
  }
  return { ...base, status: "created", documentUid: identity.documentUid, versionUid };
}
