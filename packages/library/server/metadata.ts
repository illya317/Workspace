import { prisma } from "@workspace/platform/server/prisma";
import type { LibraryDocument } from "@workspace/platform/server/prisma";
import {
  addAndConditions,
  buildFilterWhere,
} from "@workspace/platform/server/dal/pagination";
import {
  buildSetDocumentLifecycleCommand,
  buildUpdateDocumentMetadataCommand,
} from "./domain/metadata-validation";
import type { LibraryMetadataUpdateInput } from "./schemas";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { ensureLibraryCategory } from "./classification";
import { folderCategoryForPath, resolveLibraryDirectoryId } from "./directories";
import type { VersionInfo } from "./versions";

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
  versions: VersionInfo[];
  tags: string[];
  processing?: {
    markdown: string;
    preview: string;
  };
}

export interface DocumentListResult {
  documents: DocumentWithVersion[];
  total: number;
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
      currentDirectory: {
        is: {
          OR: [
            { relativePath: filters.directoryPath },
            { relativePath: { startsWith: filters.directoryPath + "/" } },
          ],
        },
      },
    });
  }
  if (typeof filters.confidentialityLevel === "number") {
    where.confidentialityLevel = filters.confidentialityLevel;
  } else if (filters.confidentialityLevel && typeof filters.confidentialityLevel === "object") {
    where.confidentialityLevel = { lte: filters.confidentialityLevel.lte };
  }
  if (filters.docId?.trim()) {
    where.docId = { contains: filters.docId.trim(), mode: "insensitive" };
  }
  if (filters.keyword?.trim()) {
    const kw = filters.keyword.trim();
    andConditions.push({
      OR: [
        { title: { contains: kw, mode: "insensitive" } },
        { fileName: { contains: kw, mode: "insensitive" } },
        { summary: { contains: kw, mode: "insensitive" } },
        { categoryName: { contains: kw, mode: "insensitive" } },
        { docId: { contains: kw, mode: "insensitive" } },
        { tags: { some: { tag: { name: { contains: kw, mode: "insensitive" } } } } },
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

async function attachLatestVersion(doc: LibraryDocument | null, includeProcessing = false): Promise<DocumentWithVersion | null> {
  if (!doc) return null;
  const [versions, tagRows] = await Promise.all([
    prisma.libraryDocumentVersion.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: {
        id: true, versionUid: true, versionNo: true, versionLabel: true,
        fileName: true, relativePath: true, extension: true, mimeType: true,
        fileSizeBytes: true, sourceModifiedAt: true, checksumSha256: true,
        gitCommit: true, changeNote: true, createdBy: true, createdAt: true,
      },
    }),
    prisma.libraryDocumentTag.findMany({
      where: { documentId: doc.id },
      select: { tag: { select: { name: true } } },
    }),
  ]);
  const tags = tagRows.map((row) => row.tag.name);
  if (!includeProcessing || versions.length === 0) return { ...doc, versions, tags };
  const versionId = versions[0]!.id;
  const [artifacts, jobs] = await Promise.all([
    prisma.libraryArtifact.findMany({
      where: { versionId, status: "ready", kind: { in: ["markdown", "preview-pdf"] } },
      select: { kind: true },
    }),
    prisma.libraryProcessingJob.findMany({
      where: { versionId, kind: { in: ["extract", "preview"] } },
      orderBy: { updatedAt: "desc" },
      select: { kind: true, status: true },
    }),
  ]);
  const artifactKinds = new Set(artifacts.map((artifact) => artifact.kind));
  const jobStatus = new Map<string, string>();
  for (const job of jobs) {
    if (!jobStatus.has(job.kind)) jobStatus.set(job.kind, job.status);
  }
  return {
    ...doc,
    versions,
    tags,
    processing: {
      markdown: artifactKinds.has("markdown") ? "ready" : jobStatus.get("extract") || "missing",
      preview: doc.extension?.toLowerCase() === "pdf"
        ? artifactKinds.has("preview-pdf") ? "ready" : jobStatus.get("preview") || "missing"
        : "skipped",
    },
  };
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
  return attachLatestVersion(doc, true);
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
  input: { id: number; userId: number; body: LibraryMetadataUpdateInput },
): Promise<DocumentWithVersion> {
  const validated = buildUpdateDocumentMetadataCommand(input.id, input.body, input.userId);
  if (!validated.ok) throw new Error(validated.issue.message);
  const command = validated.data;
  const doc = await prisma.libraryDocument.findUnique({ where: { id: command.id } });
  if (!doc) {
    throw new Error("Document not found");
  }

  const data: Record<string, unknown> = {
    ...command.data,
    editedBy: command.userId,
    editedAt: new Date(),
    version: { increment: 1 },
  };
  if (command.data.categoryCode !== undefined || command.data.categoryName !== undefined) {
    data.categoryId = await ensureLibraryCategory(
      String(command.data.categoryCode ?? doc.categoryCode ?? "") || null,
      String(command.data.categoryName ?? doc.categoryName ?? "") || null,
    );
    data.categorySource = "manual";
  }
  if (command.data.directoryPath !== undefined) {
    const directoryPath = String(command.data.directoryPath).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!directoryPath) throw new Error("请选择文件夹");
    const directoryId = await resolveLibraryDirectoryId(doc.rootKey, directoryPath);
    const category = folderCategoryForPath(directoryPath);
    data.directoryPath = directoryPath;
    data.currentDirectoryId = directoryId;
    data.categoryCode = category.code;
    data.categoryName = category.name;
    data.categoryId = await ensureLibraryCategory(category.code, category.name);
    data.categorySource = "manual";
  }

  const updated = await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("LibraryDocument", command.id, command.userId, tx);
    const updatedDoc = await tx.libraryDocument.update({
      where: { id: command.id },
      data,
    });

    if (command.tags !== undefined) {
      await tx.libraryDocumentTag.deleteMany({ where: { documentId: command.id } });
      if (command.tags.length > 0) {
        const normalizedTags = new Map<string, string>();
        for (const name of command.tags) {
          const normalizedName = name.normalize("NFKC").trim();
          const key = normalizedName.toLocaleLowerCase("zh-CN");
          if (key) normalizedTags.set(key, normalizedName);
        }
        const tagIds: number[] = [];
        for (const [key, name] of normalizedTags) {
          const tag = await tx.libraryTag.upsert({
            where: { key },
            create: { key, name },
            update: { name, status: "active" },
          });
          tagIds.push(tag.id);
        }
        await tx.libraryDocumentTag.createMany({
          data: tagIds.map((tagId) => ({ documentId: command.id, tagId, createdBy: command.userId })),
        });
      }
    }

    await snapshotHistory("LibraryDocument", command.id, command.userId, tx);
    return updatedDoc;
  });

  const result = await attachLatestVersion(updated);
  if (!result) throw new Error("Update failed");
  return result;
}

export async function setDocumentLifecycle(input: {
  id: number;
  userId: number;
  archived: boolean;
}): Promise<DocumentWithVersion> {
  const validated = buildSetDocumentLifecycleCommand(input.id, input.userId, input.archived);
  if (!validated.ok) throw new Error(validated.issue.message);
  const command = validated.data;
  const doc = await prisma.libraryDocument.findUnique({ where: { id: command.id } });
  if (!doc) {
    throw new Error("Document not found");
  }
  if (doc.status === command.status) {
    const unchanged = await attachLatestVersion(doc);
    if (!unchanged) throw new Error("Document not found");
    return unchanged;
  }
  const updated = await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("LibraryDocument", command.id, command.userId, tx);
    const result = await tx.libraryDocument.update({
      where: { id: command.id },
      data: {
        status: command.status,
        editedBy: command.userId,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await snapshotHistory("LibraryDocument", command.id, command.userId, tx);
    return result;
  });
  const result = await attachLatestVersion(updated);
  if (!result) throw new Error("Lifecycle update failed");
  return result;
}
