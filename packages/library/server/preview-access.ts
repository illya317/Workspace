import "server-only";

import { readFile } from "node:fs/promises";

import { prisma } from "@workspace/platform/server/prisma";

import { checkLibraryRead, getMaxConfidentialityLevel } from "./permissions";
import { resolveLibraryVersionRuntimeContent } from "./version-content";

export interface LibraryPreviewFile {
  buffer: Buffer;
  contentType: "application/pdf";
  fileName: string;
  size: number;
}

async function previewFileForVersion(input: {
  documentId: number;
  versionId: number;
  docId: string | null;
  versionNo?: number;
}): Promise<LibraryPreviewFile> {
  const content = await resolveLibraryVersionRuntimeContent(input.versionId);
  if (content.mimeType !== "application/pdf") throw new Error("Preview unavailable");

  const versionSuffix = input.versionNo ? `-v${input.versionNo}` : "";
  return {
    buffer: await readFile(content.absolutePath),
    contentType: "application/pdf",
    fileName: `${input.docId || `document-${input.documentId}`}${versionSuffix}-preview.pdf`,
    size: content.fileSizeBytes,
  };
}

export async function getLibraryPreviewByDocumentId(
  documentId: number,
  userId: number,
): Promise<LibraryPreviewFile> {
  if (!(await checkLibraryRead(userId))) throw new Error("Forbidden");

  const document = await prisma.libraryDocument.findUnique({
    where: { id: documentId },
    select: {
      docId: true,
      status: true,
      confidentialityLevel: true,
      currentVersionId: true,
    },
  });
  if (!document) throw new Error("Not found");
  if (document.status !== "active") throw new Error("Preview unavailable");

  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (document.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  if (!document.currentVersionId) throw new Error("Preview unavailable");

  return previewFileForVersion({
    documentId,
    versionId: document.currentVersionId,
    docId: document.docId,
  });
}

export async function getLibraryPreviewByVersionId(
  documentId: number,
  versionId: number,
  userId: number,
): Promise<LibraryPreviewFile> {
  if (!(await checkLibraryRead(userId))) throw new Error("Forbidden");

  const version = await prisma.libraryDocumentVersion.findFirst({
    where: { id: versionId, documentId },
    select: {
      id: true,
      versionNo: true,
      document: {
        select: {
          docId: true,
          status: true,
          confidentialityLevel: true,
        },
      },
    },
  });
  if (!version) throw new Error("Not found");
  if (version.document.status !== "active") throw new Error("Preview unavailable");

  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (version.document.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");

  return previewFileForVersion({
    documentId,
    versionId: version.id,
    versionNo: version.versionNo,
    docId: version.document.docId,
  });
}
