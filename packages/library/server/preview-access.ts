import "server-only";

import { prisma } from "@workspace/platform/server/prisma";

import { getLibraryDocumentAccessPolicy } from "./permissions";
import { resolveLibraryVersionRuntimeContent } from "./version-content";

export interface LibraryPreviewFile {
  absolutePath: string;
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
    absolutePath: content.absolutePath,
    contentType: "application/pdf",
    fileName: `${input.docId || `document-${input.documentId}`}${versionSuffix}-preview.pdf`,
    size: content.fileSizeBytes,
  };
}

export async function getLibraryPreviewByDocumentId(
  documentId: number,
  userId: number,
): Promise<LibraryPreviewFile> {
  const document = await prisma.libraryDocument.findUnique({
    where: { id: documentId },
    select: {
      docId: true,
      status: true,
      confidentialityLevel: true,
      generatorKey: true,
      currentVersionId: true,
    },
  });
  if (!document) throw new Error("Not found");
  if (document.status !== "active") throw new Error("Preview unavailable");

  if (!(await getLibraryDocumentAccessPolicy(userId)).allows(document)) throw new Error("Forbidden");
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
          generatorKey: true,
        },
      },
    },
  });
  if (!version) throw new Error("Not found");
  if (version.document.status !== "active") throw new Error("Preview unavailable");

  if (!(await getLibraryDocumentAccessPolicy(userId)).allows(version.document)) throw new Error("Forbidden");

  return previewFileForVersion({
    documentId,
    versionId: version.id,
    versionNo: version.versionNo,
    docId: version.document.docId,
  });
}
