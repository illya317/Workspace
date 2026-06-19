/** LibraryDocument 版本管理服务 */
import { prisma } from "@workspace/platform/server/prisma";

export interface VersionInfo {
  id: number;
  versionNo: number;
  relativePath: string;
  fileSizeBytes: number | null;
  fileMtime: Date | null;
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
      id: true, versionNo: true, relativePath: true, fileSizeBytes: true,
      fileMtime: true, checksumSha256: true, gitCommit: true,
      changeNote: true, createdBy: true, createdAt: true,
    },
  });
  return rows;
}
