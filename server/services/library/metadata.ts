import { prisma } from "@/lib/prisma";
import type { LibraryDocument, LibraryDocumentVersion } from "@/generated/prisma/client";

// ─── Types ───────────────────────────────────────────────────

export interface ListFilters {
  categoryCode?: string;
  status?: string;
  origin?: string;
  confidentialityLevel?: number | { lte: number };
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface DocumentWithVersion extends LibraryDocument {
  versions: LibraryDocumentVersion[];
}

export interface DocumentListResult {
  documents: DocumentWithVersion[];
  total: number;
}

export interface UpdateMetadataInput {
  title?: string;
  summary?: string;
  categoryCode?: string;
  categoryName?: string;
  subcategoryPath?: string;
  confidentialityLevel?: number;
  status?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function buildWhere(filters: ListFilters) {
  const where: Record<string, unknown> = {};

  if (filters.categoryCode) {
    where.categoryCode = filters.categoryCode;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.origin) {
    where.origin = filters.origin;
  }
  if (typeof filters.confidentialityLevel === "number") {
    where.confidentialityLevel = filters.confidentialityLevel;
  } else if (filters.confidentialityLevel && typeof filters.confidentialityLevel === "object") {
    where.confidentialityLevel = { lte: filters.confidentialityLevel.lte };
  }
  if (filters.keyword?.trim()) {
    const kw = filters.keyword.trim();
    where.OR = [
      { title: { contains: kw } },
      { fileName: { contains: kw } },
      { summary: { contains: kw } },
      { categoryName: { contains: kw } },
    ];
  }

  return where;
}

function getPagination(filters: ListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 50));
  return { skip: (page - 1) * pageSize, take: pageSize };
}

async function attachLatestVersion(doc: LibraryDocument | null): Promise<DocumentWithVersion | null> {
  if (!doc) return null;
  const versions = await prisma.libraryDocumentVersion.findMany({
    where: { documentId: doc.id },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  return { ...doc, versions };
}

// ─── CRUD ────────────────────────────────────────────────────

export async function listDocuments(
  filters: ListFilters,
): Promise<DocumentListResult> {
  const where = buildWhere(filters);
  const { skip, take } = getPagination(filters);

  const [documents, total] = await Promise.all([
    prisma.libraryDocument.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.libraryDocument.count({ where }),
  ]);

  const documentsWithVersions = await Promise.all(
    documents.map((d) => attachLatestVersion(d)),
  );

  return { documents: documentsWithVersions as DocumentWithVersion[], total };
}

export async function getDocument(id: number): Promise<DocumentWithVersion | null> {
  const doc = await prisma.libraryDocument.findUnique({
    where: { id },
  });
  return attachLatestVersion(doc);
}

export async function updateDocumentMetadata(
  id: number,
  input: UpdateMetadataInput,
  userId: number,
): Promise<DocumentWithVersion> {
  const doc = await prisma.libraryDocument.findUnique({ where: { id } });
  if (!doc) {
    throw new Error("Document not found");
  }

  // 只接受白名单字段，拒绝运行时传入的额外字段
  const data: Record<string, unknown> = {
    editedBy: userId,
    editedAt: new Date(),
    version: { increment: 1 },
  };
  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.categoryCode !== undefined) data.categoryCode = input.categoryCode;
  if (input.categoryName !== undefined) data.categoryName = input.categoryName;
  if (input.subcategoryPath !== undefined) data.subcategoryPath = input.subcategoryPath;
  if (input.confidentialityLevel !== undefined) data.confidentialityLevel = input.confidentialityLevel;
  if (input.status !== undefined) data.status = input.status;

  const updated = await prisma.libraryDocument.update({
    where: { id },
    data,
  });

  const result = await attachLatestVersion(updated);
  if (!result) throw new Error("Update failed");
  return result;
}
