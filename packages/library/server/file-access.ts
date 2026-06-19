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

async function readAllowedFile(filePath: string, fileName: string): Promise<LibraryFilePayload> {
  if (!ensureInsideRoot(filePath)) throw new Error("Forbidden");
  const fileStat = await stat(filePath);
  if (fileStat.isDirectory()) throw new Error("Not a file");
  const ext = path.extname(filePath).toLowerCase();
  return {
    buffer: await readFile(filePath),
    contentType: MIME_TYPES[ext] || "application/octet-stream",
    fileName,
    size: fileStat.size,
  };
}

export async function getLibraryFileByDocumentId(documentId: number, userId: number) {
  const doc = await prisma.libraryDocument.findUnique({
    where: { id: documentId },
    select: { id: true, relativePath: true, fileName: true, confidentialityLevel: true, status: true },
  });
  if (!doc) throw new Error("Not found");
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (doc.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  if (doc.status === "missing") throw new Error("File missing");
  if (!doc.relativePath) throw new Error("No file path");
  const filePath = safeResolve(doc.relativePath);
  if (!filePath) throw new Error("Forbidden");
  return readAllowedFile(filePath, doc.fileName);
}

export async function getLibraryFileByRelativePath(relativePath: string, userId: number) {
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  const filePath = safeResolve(relativePath);
  if (!filePath) throw new Error("Forbidden");

  const doc = await prisma.libraryDocument.findFirst({
    where: { relativePath: normalizedRelativePath },
    select: { id: true, confidentialityLevel: true, status: true },
  });
  if (!doc) throw new Error("File not indexed - run scan first");
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (doc.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  if (doc.status === "missing") throw new Error("File missing");
  return readAllowedFile(filePath, path.basename(filePath));
}
