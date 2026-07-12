import { readFile, stat } from "fs/promises";
import path from "path";
import { prisma } from "@workspace/platform/server/prisma";
import { getDefaultRoot, safeResolve } from "./config";
import { getMaxConfidentialityLevel } from "./permissions";
import { resolveLibraryVersionRuntimeContent } from "./version-content";

import { resolveLibraryMimeType } from "./file-facts";

export { resolveLibraryMimeType } from "./file-facts";

export interface LibraryFilePayload {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  size: number;
}

export interface LibraryFileMetadata {
  contentType: string;
  fileName: string;
  size: number;
}

function ensureInsideRoot(filePath: string) {
  const root = getDefaultRoot();
  const normalizedRoot = path.resolve(root) + path.sep;
  return path.resolve(filePath).startsWith(normalizedRoot);
}

function ensureDocumentIsDownloadable(status: string) {
  if (status !== "active") throw new Error("File unavailable");
}

function downloadFileName(originalFileName: string, runtimeFileName: string) {
  const originalExtension = path.extname(originalFileName);
  const runtimeExtension = path.extname(runtimeFileName);
  if (!runtimeExtension || originalExtension.toLocaleLowerCase() === runtimeExtension.toLocaleLowerCase()) {
    return originalFileName;
  }
  return `${path.basename(originalFileName, originalExtension)}${runtimeExtension}`;
}

async function readAllowedFile(
  filePath: string,
  fileName: string,
  declaredMimeType?: string | null,
): Promise<LibraryFilePayload> {
  if (!ensureInsideRoot(filePath)) throw new Error("Forbidden");
  const fileStat = await stat(filePath);
  if (fileStat.isDirectory()) throw new Error("Not a file");
  return {
    buffer: await readFile(filePath),
    contentType: resolveLibraryMimeType(fileName, declaredMimeType),
    fileName,
    size: fileStat.size,
  };
}

async function resolveAllowedVersionByUid(versionUid: string, userId: number) {
  const version = await prisma.libraryDocumentVersion.findUnique({
    where: { versionUid },
    select: {
      id: true,
      fileName: true,
      document: { select: { confidentialityLevel: true, status: true } },
    },
  });
  if (!version) throw new Error("Version not found");
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (version.document.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  ensureDocumentIsDownloadable(version.document.status);
  const content = await resolveLibraryVersionRuntimeContent(version.id);
  if (!ensureInsideRoot(content.absolutePath)) throw new Error("Forbidden");
  return {
    absolutePath: content.absolutePath,
    contentType: resolveLibraryMimeType(content.fileName, content.mimeType),
    fileName: downloadFileName(version.fileName, content.fileName),
  };
}

export async function getLibraryFileMetadataByVersionUid(versionUid: string, userId: number): Promise<LibraryFileMetadata> {
  const resolved = await resolveAllowedVersionByUid(versionUid, userId);
  const fileStat = await stat(resolved.absolutePath);
  if (fileStat.isDirectory()) throw new Error("Not a file");
  return { contentType: resolved.contentType, fileName: resolved.fileName, size: fileStat.size };
}

export async function getLibraryFileByVersionUid(versionUid: string, userId: number): Promise<LibraryFilePayload> {
  const resolved = await resolveAllowedVersionByUid(versionUid, userId);
  return readAllowedFile(resolved.absolutePath, resolved.fileName, resolved.contentType);
}

export async function getLibraryFileByDocumentId(documentId: number, userId: number) {
  const doc = await prisma.libraryDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      confidentialityLevel: true,
      status: true,
      currentVersion: {
        select: { id: true, fileName: true },
      },
    },
  });
  if (!doc) throw new Error("Not found");
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (doc.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  ensureDocumentIsDownloadable(doc.status);
  if (!doc.currentVersion) throw new Error("Current version unavailable");
  const content = await resolveLibraryVersionRuntimeContent(doc.currentVersion.id);
  return readAllowedFile(
    content.absolutePath,
    downloadFileName(doc.currentVersion.fileName, content.fileName),
    content.mimeType || doc.mimeType,
  );
}

export async function getLibraryFileByVersionId(documentId: number, versionId: number, userId: number) {
  const version = await prisma.libraryDocumentVersion.findFirst({
    where: { id: versionId, documentId },
    select: {
      id: true,
      fileName: true,
      document: { select: { confidentialityLevel: true, status: true } },
    },
  });
  if (!version) throw new Error("Version not found");
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (version.document.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  ensureDocumentIsDownloadable(version.document.status);
  const content = await resolveLibraryVersionRuntimeContent(version.id);
  return readAllowedFile(
    content.absolutePath,
    downloadFileName(version.fileName, content.fileName),
    content.mimeType,
  );
}

export async function getLibraryFileByRelativePath(relativePath: string, userId: number) {
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  const filePath = safeResolve(relativePath);
  if (!filePath) throw new Error("Forbidden");

  const doc = await prisma.libraryDocument.findFirst({
    where: { relativePath: normalizedRelativePath },
    select: {
      id: true,
      confidentialityLevel: true,
      status: true,
      fileName: true,
      mimeType: true,
      currentVersion: {
        select: { id: true, fileName: true },
      },
    },
  });
  if (!doc) throw new Error("File not indexed - run scan first");
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (doc.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  ensureDocumentIsDownloadable(doc.status);
  if (!doc.currentVersion) throw new Error("Current version unavailable");
  const content = await resolveLibraryVersionRuntimeContent(doc.currentVersion.id);
  return readAllowedFile(
    content.absolutePath,
    downloadFileName(doc.currentVersion.fileName, content.fileName),
    content.mimeType || doc.mimeType,
  );
}
