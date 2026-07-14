/** LibraryDocument 版本管理服务 */
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { prisma } from "@workspace/platform/server/prisma";

import type { LibraryVersionUploadCommand } from "./domain/version-file-validation";
import { getLibraryUploadMaxBytes } from "./domain/version-file-validation";
import { resolveLibraryMimeType } from "./file-access";
import { runUploadedLibraryDocumentPipeline } from "./uploads";
import {
  removeManagedVersionFile,
  writeManagedVersionFile,
  type ManagedVersionFile,
} from "./version-storage";

export interface VersionInfo {
  id: number;
  versionUid: string;
  versionNo: number;
  versionLabel: string | null;
  fileName: string;
  relativePath: string;
  extension: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  sourceModifiedAt: Date | null;
  checksumSha256: string | null;
  gitCommit: string | null;
  changeNote: string | null;
  createdBy: number | null;
  createdAt: Date;
}

export async function getDocumentVersions(documentId: number): Promise<VersionInfo[]> {
  const rows = await prisma.libraryDocumentVersion.findMany({
    where: { documentId },
    orderBy: { versionNo: "desc" },
    select: {
      id: true, versionUid: true, versionNo: true, versionLabel: true,
      fileName: true, relativePath: true,
      extension: true, mimeType: true, fileSizeBytes: true,
      sourceModifiedAt: true, checksumSha256: true, gitCommit: true,
      changeNote: true, createdBy: true, createdAt: true,
    },
  });
  return rows;
}

export async function getDocumentVersionState(documentId: number) {
  const [document, versions] = await Promise.all([
    prisma.libraryDocument.findUnique({
      where: { id: documentId },
      select: { currentVersionId: true },
    }),
    getDocumentVersions(documentId),
  ]);
  return {
    currentVersionId: document?.currentVersionId ?? null,
    versions,
  };
}

export class LibraryVersionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "LibraryVersionError";
  }
}

function sourceModifiedAt(file: File, fallback: Date) {
  if (!Number.isFinite(file.lastModified) || file.lastModified <= 0) return fallback;
  const value = new Date(file.lastModified);
  return Number.isNaN(value.getTime()) ? fallback : value;
}

function fileExtension(fileName: string) {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  return extension || null;
}

async function loadUploadTarget(documentId: number) {
  return prisma.libraryDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      documentUid: true,
      fileName: true,
      relativePath: true,
      status: true,
      currentVersionId: true,
    },
  });
}

function replacementFileName(currentFileName: string, uploadedFileName: string) {
  const currentExtension = path.extname(currentFileName).toLocaleLowerCase();
  const uploadedExtension = path.extname(uploadedFileName).toLocaleLowerCase();
  if (currentExtension !== uploadedExtension) {
    throw new LibraryVersionError("New version must use the same file type as the current document", 400);
  }
  return currentFileName;
}

export async function uploadDocumentVersion(command: LibraryVersionUploadCommand) {
  const document = await loadUploadTarget(command.documentId);
  if (!document) throw new LibraryVersionError("Not found", 404);
  if (document.status !== "active") {
    throw new LibraryVersionError("Only active documents can receive a new version", 409);
  }
  const fileName = replacementFileName(document.fileName, command.fileName);

  const buffer = Buffer.from(await command.file.arrayBuffer());
  if (buffer.length <= 0) throw new LibraryVersionError("Uploaded file is empty", 400);
  if (buffer.length > getLibraryUploadMaxBytes()) {
    throw new LibraryVersionError("Uploaded file exceeds the configured size limit", 413);
  }

  const now = new Date();
  const versionUid = randomUUID();
  const checksumSha256 = createHash("sha256").update(buffer).digest("hex");
  let uploadedFile: ManagedVersionFile | null = null;

  try {
    const storedUpload = await writeManagedVersionFile({
      documentUid: document.documentUid,
      versionUid,
      fileName,
      buffer,
    });
    uploadedFile = storedUpload;

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.libraryDocument.findUnique({
        where: { id: command.documentId },
        select: { id: true, fileName: true, relativePath: true, status: true, currentVersionId: true },
      });
      if (!current) throw new LibraryVersionError("Not found", 404);
      if (current.status !== "active") {
        throw new LibraryVersionError("Only active documents can receive a new version", 409);
      }
      if (current.currentVersionId !== document.currentVersionId) {
        throw new LibraryVersionError("Current version changed; retry the upload", 409);
      }
      if (current.fileName !== fileName) {
        throw new LibraryVersionError("Document file name changed; retry the upload", 409);
      }

      const latestVersion = await tx.libraryDocumentVersion.findFirst({
        where: { documentId: current.id },
        orderBy: { versionNo: "desc" },
        select: { versionNo: true },
      });
      const versionNo = (latestVersion?.versionNo ?? 0) + 1;
      const versionLabel = command.versionLabel || `V${versionNo}`;
      const modifiedAt = sourceModifiedAt(command.file, now);
      const mimeType = resolveLibraryMimeType(fileName, command.file.type);

      const version = await tx.libraryDocumentVersion.create({
        data: {
          versionUid,
          documentId: current.id,
          versionNo,
          versionLabel,
          fileName,
          storagePath: storedUpload.relativePath,
          storageFileName: fileName,
          storageMimeType: mimeType,
          storageFileSizeBytes: buffer.length,
          storageChecksumSha256: checksumSha256,
          relativePath: current.relativePath,
          extension: fileExtension(fileName),
          mimeType,
          fileSizeBytes: buffer.length,
          sourceModifiedAt: modifiedAt,
          checksumSha256,
          changeNote: command.changeNote || null,
          createdBy: command.userId,
        },
        select: {
          id: true,
          versionUid: true,
          versionNo: true,
          versionLabel: true,
          fileName: true,
          fileSizeBytes: true,
          mimeType: true,
          checksumSha256: true,
          changeNote: true,
          createdBy: true,
          createdAt: true,
        },
      });

      await tx.libraryDocument.update({
        where: { id: current.id },
        data: {
          currentVersionId: version.id,
          fileSizeBytes: version.fileSizeBytes,
          fileMtime: modifiedAt,
          checksumSha256,
          version: version.versionNo,
          versionLabel: version.versionLabel,
          editedBy: command.userId,
          editedAt: now,
        },
      });

      return version;
    });

    const pipeline = await runUploadedLibraryDocumentPipeline(result.versionUid, fileExtension(fileName));
    return { documentId: command.documentId, version: result, pipeline };
  } catch (error) {
    await removeManagedVersionFile(uploadedFile);
    throw error;
  }
}
