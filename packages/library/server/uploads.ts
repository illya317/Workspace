import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { prisma } from "@workspace/platform/server/prisma";

import { ensureLibraryCategory } from "./classification";
import { folderCategoryForPath, resolveLibraryDirectoryId } from "./directories";
import type { UploadLibraryDocumentCommand } from "./domain/upload-validation";
import {
  buildReviewLibraryDocumentCommand,
  buildUploadLibraryDocumentCommand,
} from "./domain/upload-validation";
import { createLibraryDocumentIdentity } from "./domain/document-identity";
import { resolveLibraryMimeType } from "./file-access";
import { previewLibraryVersion, supportsLibraryPreview } from "./preview";
import { processLibraryVersion } from "./processing";
import { promoteLibraryVersionToCompactRuntime } from "./version-content";
import { removeManagedVersionFile, writeManagedVersionFile } from "./version-storage";

export class LibraryUploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "LibraryUploadError";
  }
}

function extension(fileName: string) {
  return path.extname(fileName).slice(1).toLowerCase() || null;
}

function sourceModifiedAt(file: File, fallback: Date) {
  if (!Number.isFinite(file.lastModified) || file.lastModified <= 0) return fallback;
  const value = new Date(file.lastModified);
  return Number.isNaN(value.getTime()) ? fallback : value;
}

function pipelineResult(result: PromiseSettledResult<unknown>) {
  return result.status === "fulfilled"
    ? { status: "succeeded" as const }
    : { status: "failed" as const, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
}

export async function runUploadedLibraryDocumentPipeline(versionUid: string, fileExtension: string | null) {
  const previewable = supportsLibraryPreview(fileExtension);
  const [markdown, preview] = await Promise.allSettled([
    processLibraryVersion({ versionUid }),
    previewable ? previewLibraryVersion({ versionUid }) : Promise.resolve(null),
  ]);
  let compact: Awaited<ReturnType<typeof promoteLibraryVersionToCompactRuntime>> | null = null;
  if (previewable && markdown.status === "fulfilled" && preview.status === "fulfilled") {
    const version = await prisma.libraryDocumentVersion.findUnique({
      where: { versionUid },
      select: { id: true },
    });
    if (version) compact = await promoteLibraryVersionToCompactRuntime(version.id);
  }
  return {
    markdown: pipelineResult(markdown),
    preview: previewable ? pipelineResult(preview) : { status: "skipped" as const },
    compact,
  };
}

export async function uploadLibraryDocument(command: UploadLibraryDocumentCommand) {
  const validated = buildUploadLibraryDocumentCommand({
    ...command,
    tags: JSON.stringify(command.tags),
    confidentialityLevel: String(command.confidentialityLevel),
  });
  if (!validated.ok) throw new LibraryUploadError(validated.issue.message, validated.issue.status);
  command = validated.data;
  const buffer = Buffer.from(await command.file.arrayBuffer());
  if (buffer.length <= 0) throw new LibraryUploadError("上传文件不能为空");
  const now = new Date();
  const identity = createLibraryDocumentIdentity(now);
  const versionUid = randomUUID();
  const checksumSha256 = createHash("sha256").update(buffer).digest("hex");
  const fileExtension = extension(command.fileName);
  const mimeType = resolveLibraryMimeType(command.fileName, command.file.type);
  const directoryId = await resolveLibraryDirectoryId("default", command.directoryPath);
  const category = folderCategoryForPath(command.directoryPath);
  const categoryId = await ensureLibraryCategory(category.code, category.name);
  const stored = await writeManagedVersionFile({
    documentUid: identity.documentUid,
    versionUid,
    fileName: command.fileName,
    buffer,
  });

  try {
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.libraryDocument.create({
        data: {
          ...identity,
          stableKey: `uploaded:${identity.documentUid}`,
          rootKey: "default",
          relativePath: path.posix.join("uploads", identity.documentUid, command.fileName),
          fileName: command.fileName,
          extension: fileExtension,
          mimeType,
          fileSizeBytes: buffer.length,
          fileMtime: sourceModifiedAt(command.file, now),
          checksumSha256,
          categoryCode: category.code,
          categoryName: category.name,
          categoryId,
          currentDirectoryId: directoryId,
          directoryPath: command.directoryPath,
          categorySource: "manual",
          title: command.title,
          summary: command.summary ?? null,
          confidentialityLevel: command.confidentialityLevel,
          origin: "uploaded",
          ownerUserId: command.userId,
          reviewStatus: "pending",
          editedBy: command.userId,
          editedAt: now,
          version: 1,
          versionLabel: "V1",
        },
      });
      const version = await tx.libraryDocumentVersion.create({
        data: {
          versionUid,
          documentId: created.id,
          versionNo: 1,
          versionLabel: "V1",
          fileName: command.fileName,
          storagePath: stored.relativePath,
          storageFileName: command.fileName,
          storageMimeType: mimeType,
          storageFileSizeBytes: buffer.length,
          storageChecksumSha256: checksumSha256,
          relativePath: path.posix.join("uploads", identity.documentUid, command.fileName),
          extension: fileExtension,
          mimeType,
          fileSizeBytes: buffer.length,
          sourceModifiedAt: sourceModifiedAt(command.file, now),
          checksumSha256,
          changeNote: "首次上传入库",
          createdBy: command.userId,
        },
      });
      await tx.libraryDocument.update({ where: { id: created.id }, data: { currentVersionId: version.id } });
      for (const name of command.tags) {
        const key = name.toLocaleLowerCase("zh-CN");
        const tag = await tx.libraryTag.upsert({
          where: { key },
          create: { key, name },
          update: { name, status: "active" },
        });
        await tx.libraryDocumentTag.create({ data: { documentId: created.id, tagId: tag.id, createdBy: command.userId } });
      }
      return { id: created.id, documentUid: created.documentUid, versionUid: version.versionUid };
    });
    const pipeline = await runUploadedLibraryDocumentPipeline(versionUid, fileExtension);
    return { documentId: document.id, documentUid: document.documentUid, versionUid, pipeline };
  } catch (error) {
    await removeManagedVersionFile(stored);
    throw error;
  }
}

export async function reviewLibraryDocument(input: { id: number; userId: number }) {
  const validated = buildReviewLibraryDocumentCommand(input);
  if (!validated.ok) throw new LibraryUploadError(validated.issue.message, validated.issue.status);
  input = validated.data;
  const document = await prisma.libraryDocument.findUnique({ where: { id: input.id } });
  if (!document) throw new LibraryUploadError("资料不存在", 404);
  if (document.status !== "active") throw new LibraryUploadError("只有有效资料可以确认入库", 409);
  if (document.reviewStatus === "approved") return document;
  return prisma.libraryDocument.update({
    where: { id: input.id },
    data: {
      reviewStatus: "approved",
      reviewedBy: input.userId,
      reviewedAt: new Date(),
      editedBy: input.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
}
