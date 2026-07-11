import { readFile, stat } from "fs/promises";
import path from "path";
import { prisma } from "@workspace/platform/server/prisma";
import { getDefaultRoot, safeResolve } from "./config";
import { getMaxConfidentialityLevel } from "./permissions";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".xml": "application/xml",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
};

export interface LibraryFilePayload {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  size: number;
}

function ensureInsideRoot(filePath: string) {
  const root = getDefaultRoot();
  const normalizedRoot = path.resolve(root) + path.sep;
  return path.resolve(filePath).startsWith(normalizedRoot);
}

export function resolveLibraryMimeType(fileName: string, declaredMimeType?: string | null) {
  const declared = declaredMimeType?.trim();
  if (declared) return declared;
  return MIME_TYPES[path.extname(fileName).toLowerCase()] || "application/octet-stream";
}

function ensureDocumentIsDownloadable(status: string) {
  if (status !== "active") throw new Error("File unavailable");
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
        select: { storagePath: true, fileName: true, mimeType: true },
      },
    },
  });
  if (!doc) throw new Error("Not found");
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (doc.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  ensureDocumentIsDownloadable(doc.status);
  if (!doc.currentVersion) throw new Error("Current version unavailable");
  const filePath = safeResolve(doc.currentVersion.storagePath);
  if (!filePath) throw new Error("Forbidden");
  return readAllowedFile(filePath, doc.currentVersion.fileName, doc.currentVersion.mimeType || doc.mimeType);
}

export async function getLibraryFileByVersionId(documentId: number, versionId: number, userId: number) {
  const version = await prisma.libraryDocumentVersion.findFirst({
    where: { id: versionId, documentId },
    select: {
      storagePath: true,
      fileName: true,
      mimeType: true,
      document: { select: { confidentialityLevel: true, status: true } },
    },
  });
  if (!version) throw new Error("Version not found");
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (version.document.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  ensureDocumentIsDownloadable(version.document.status);
  const filePath = safeResolve(version.storagePath);
  if (!filePath) throw new Error("Forbidden");
  return readAllowedFile(filePath, version.fileName, version.mimeType);
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
        select: { storagePath: true, fileName: true, mimeType: true },
      },
    },
  });
  if (!doc) throw new Error("File not indexed - run scan first");
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (doc.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  ensureDocumentIsDownloadable(doc.status);
  if (!doc.currentVersion) throw new Error("Current version unavailable");
  const resolvedStoragePath = safeResolve(doc.currentVersion.storagePath);
  if (!resolvedStoragePath) throw new Error("Forbidden");
  return readAllowedFile(
    resolvedStoragePath,
    doc.currentVersion.fileName,
    doc.currentVersion.mimeType || doc.mimeType,
  );
}
