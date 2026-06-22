import { prisma } from "@workspace/platform/server/prisma";
import type { LibraryDocument, LibraryDocumentVersion } from "@workspace/platform/server/prisma";
import {
  addAndConditions,
  buildFilterWhere,
} from "@workspace/platform/server/dal/pagination";
import {
  buildArchiveDocumentCommand,
  buildUpdateDocumentMetadataCommand,
} from "./domain/metadata-validation";

// ─── Types ───────────────────────────────────────────────────

export interface ListFilters {
  categoryCode?: string;
  directoryPath?: string;
  status?: string;
  origin?: string;
  confidentialityLevel?: number | { lte: number };
  keyword?: string;
  docId?: string;
  page?: number;
  pageSize?: number;
}

export interface DocumentWithVersion extends LibraryDocument {
  versions: LibraryDocumentVersion[];
  tags: string[];
}

export interface DocumentListResult {
  documents: DocumentWithVersion[];
  total: number;
}

export interface UpdateMetadataInput {
  title?: string;
  summary?: string;
  docId?: string;
  tags?: string[];
  categoryCode?: string;
  categoryName?: string;
  subcategoryPath?: string;
  confidentialityLevel?: number;
  status?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function buildWhere(filters: ListFilters) {
  const where = buildFilterWhere<Record<string, unknown>>(filters as Record<string, unknown>, [
    "categoryCode",
    "status",
    "origin",
  ]);
  const andConditions: Record<string, unknown>[] = [];

  if (filters.directoryPath) {
    andConditions.push({
      OR: [
      { directoryPath: filters.directoryPath },
      { directoryPath: { startsWith: filters.directoryPath + "/" } },
      ],
    });
  }
  if (typeof filters.confidentialityLevel === "number") {
    where.confidentialityLevel = filters.confidentialityLevel;
  } else if (filters.confidentialityLevel && typeof filters.confidentialityLevel === "object") {
    where.confidentialityLevel = { lte: filters.confidentialityLevel.lte };
  }
  if (filters.docId?.trim()) {
    where.docId = { contains: filters.docId.trim() };
  }
  if (filters.keyword?.trim()) {
    const kw = filters.keyword.trim();
    andConditions.push({
      OR: [
        { title: { contains: kw } },
        { fileName: { contains: kw } },
        { summary: { contains: kw } },
        { categoryName: { contains: kw } },
        { docId: { contains: kw } },
        { tags: { some: { tag: { contains: kw } } } },
      ],
    });
  }

  return addAndConditions(where, andConditions);
}

function getPagination(filters: ListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 50));
  return { skip: (page - 1) * pageSize, take: pageSize };
}

async function attachLatestVersion(doc: LibraryDocument | null): Promise<DocumentWithVersion | null> {
  if (!doc) return null;
  const [versions, tagRows] = await Promise.all([
    prisma.libraryDocumentVersion.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
    prisma.libraryDocumentTag.findMany({
      where: { documentId: doc.id },
      select: { tag: true },
    }),
  ]);
  const tags = tagRows.map((t) => t.tag);
  return { ...doc, versions, tags };
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

export interface CategoryItem {
  code: string;
  name: string;
  count: number;
}

export async function listCategories(
  confidentialityFilter?: { lte: number },
): Promise<CategoryItem[]> {
  const where: Record<string, unknown> = {};
  if (confidentialityFilter) {
    where.confidentialityLevel = confidentialityFilter;
  }
  where.categoryCode = { not: null };

  const docs = await prisma.libraryDocument.findMany({
    where,
    select: { categoryCode: true, categoryName: true, id: true },
  });

  const map = new Map<string, { name: string; count: number }>();
  for (const d of docs) {
    if (!d.categoryCode) continue;
    const existing = map.get(d.categoryCode);
    if (existing) {
      existing.count++;
      if (!existing.name && d.categoryName) existing.name = d.categoryName;
    } else {
      map.set(d.categoryCode, { name: d.categoryName || d.categoryCode, count: 1 });
    }
  }

  return Array.from(map.entries())
    .map(([code, { name, count }]) => ({ code, name, count }))
    .sort((a, b) => a.code.localeCompare(b.code, "zh"));
}

export async function updateDocumentMetadata(
  id: number,
  input: UpdateMetadataInput,
  userId: number,
): Promise<DocumentWithVersion> {
  const command = buildUpdateDocumentMetadataCommand(id, input, userId);
  if (!command.ok) throw new Error(command.issue.message);

  const doc = await prisma.libraryDocument.findUnique({ where: { id: command.data.id } });
  if (!doc) {
    throw new Error("Document not found");
  }

  const data: Record<string, unknown> = {
    ...command.data.data,
    editedBy: command.data.userId,
    editedAt: new Date(),
    version: { increment: 1 },
  };

  const updated = await prisma.$transaction(async (tx) => {
    const updatedDoc = await tx.libraryDocument.update({
      where: { id: command.data.id },
      data,
    });

    if (command.data.tags !== undefined) {
      await tx.libraryDocumentTag.deleteMany({ where: { documentId: command.data.id } });
      if (command.data.tags.length > 0) {
        await tx.libraryDocumentTag.createMany({
          data: command.data.tags.map((tag) => ({ documentId: command.data.id, tag })),
        });
      }
    }

    return updatedDoc;
  });

  const result = await attachLatestVersion(updated);
  if (!result) throw new Error("Update failed");
  return result;
}

export async function archiveDocument(id: number, userId: number): Promise<void> {
  const command = buildArchiveDocumentCommand(id, userId);
  if (!command.ok) throw new Error(command.issue.message);
  const doc = await prisma.libraryDocument.findUnique({ where: { id: command.data.id } });
  if (!doc) {
    throw new Error("Document not found");
  }
  await prisma.libraryDocument.update({
    where: { id: command.data.id },
    data: {
      status: "archived",
      editedBy: command.data.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
}
