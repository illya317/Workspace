import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "@workspace/platform/server/prisma";
import { safeResolve, getDefaultRoot } from "@workspace/library/server/config";
import { createLibraryDocumentIdentity } from "@workspace/library/server/domain/document-identity";
import { ensureLibraryCategory } from "@workspace/library/server/classification";
import { ensureLibraryDirectory } from "@workspace/library/server/directories";
import type { GeneratorOutput } from "./types";
import { buildGeneratedDocumentCommand } from "../domain/generated-document-validation";
import { removeManagedVersionFile, writeManagedVersionFile } from "../version-storage";
import { runUploadedLibraryDocumentPipeline } from "../uploads";

export interface GeneratedDocumentInput {
  generatorKey: string;
  title: string;
  summary?: string;
  confidentialityLevel: number;
  categoryCode?: string;
  categoryName?: string;
  userId: number;
}

export async function upsertGeneratedDocument(
  input: GeneratedDocumentInput,
  output: GeneratorOutput,
): Promise<{ document: { id: number; stableKey: string }; isNewVersion: boolean }> {
  const command = buildGeneratedDocumentCommand(input, output);
  if (!command.ok) throw new Error(command.issue.message);
  const normalizedInput = command.data.input;
  const normalizedOutput = command.data.output;

  const root = getDefaultRoot();
  if (!root) throw new Error("LIBRARY_ROOT not configured");

  const dirSlug = sanitizePathSegment(normalizedInput.generatorKey);
  const titleSlug = slug(normalizedInput.title);
  const titleHash = crypto.createHash("sha256").update(normalizedInput.title).digest("hex").slice(0, 8);
  const baseName = `${titleSlug || "untitled"}-${titleHash}`;
  const fileName = `${baseName}.${normalizedOutput.extension}`;
  const fileSlug = sanitizePathSegment(fileName);
  const relativePath = path.join("generated", dirSlug, fileSlug);
  const absPath = safeResolve(relativePath, root);
  if (!absPath) throw new Error("Invalid generated file path");

  // Ensure directory exists
  await fs.mkdir(path.dirname(absPath), { recursive: true });

  const content = Buffer.isBuffer(normalizedOutput.content)
    ? normalizedOutput.content
    : Buffer.from(normalizedOutput.content, "utf-8");
  await fs.writeFile(absPath, content);

  const stats = await fs.stat(absPath);
  const checksum = crypto.createHash("sha256").update(content).digest("hex");
  const stableKey = `generated:${normalizedInput.generatorKey}:${baseName}`;

  const now = new Date();

  const existingDoc = await prisma.libraryDocument.findUnique({ where: { stableKey } });
  const identity = existingDoc
    ? { documentUid: existingDoc.documentUid, docId: existingDoc.docId }
    : createLibraryDocumentIdentity(now);
  const [currentDirectoryId, categoryId] = await Promise.all([
    ensureLibraryDirectory("default", path.dirname(relativePath)),
    ensureLibraryCategory(normalizedInput.categoryCode, normalizedInput.categoryName),
  ]);

  // Upsert LibraryDocument
  const doc = await prisma.libraryDocument.upsert({
    where: { stableKey },
    create: {
      stableKey,
      ...identity,
      rootKey: "default",
      relativePath,
      fileName,
      extension: normalizedOutput.extension,
      mimeType: normalizedOutput.mimeType,
      fileSizeBytes: stats.size,
      fileMtime: stats.mtime,
      checksumSha256: checksum,
      title: normalizedInput.title,
      summary: normalizedInput.summary ?? null,
      categoryCode: normalizedInput.categoryCode ?? null,
      categoryName: normalizedInput.categoryName ?? null,
      categoryId,
      currentDirectoryId,
      confidentialityLevel: normalizedInput.confidentialityLevel,
      status: "active",
      origin: "generated",
      generatorKey: normalizedInput.generatorKey,
      editedBy: normalizedInput.userId,
      editedAt: now,
    },
    update: {
      relativePath,
      fileName,
      extension: normalizedOutput.extension,
      mimeType: normalizedOutput.mimeType,
      fileSizeBytes: stats.size,
      fileMtime: stats.mtime,
      checksumSha256: checksum,
      title: normalizedInput.title,
      summary: normalizedInput.summary ?? null,
      categoryCode: normalizedInput.categoryCode ?? null,
      categoryName: normalizedInput.categoryName ?? null,
      categoryId,
      currentDirectoryId,
      confidentialityLevel: normalizedInput.confidentialityLevel,
      status: "active",
      editedBy: normalizedInput.userId,
      editedAt: now,
    },
  });

  // Check if content changed by comparing last version checksum
  const lastVersion = await prisma.libraryDocumentVersion.findFirst({
    where: { documentId: doc.id },
    orderBy: { versionNo: "desc" },
  });

  const isNewVersion = !lastVersion || lastVersion.checksumSha256 !== checksum;
  let newVersionUid: string | null = null;

  if (isNewVersion) {
    const nextVersionNo = (lastVersion?.versionNo ?? 0) + 1;
    const versionUid = crypto.randomUUID();
    const managedFile = await writeManagedVersionFile({
      documentUid: doc.documentUid,
      versionUid,
      fileName,
      buffer: content,
    });
    try {
      await prisma.$transaction(async (tx) => {
        const version = await tx.libraryDocumentVersion.create({
          data: {
            versionUid,
            documentId: doc.id,
            versionNo: nextVersionNo,
            versionLabel: `V${nextVersionNo}`,
            fileName,
            storagePath: managedFile.relativePath,
            storageFileName: fileName,
            storageMimeType: normalizedOutput.mimeType,
            storageFileSizeBytes: stats.size,
            storageChecksumSha256: checksum,
            relativePath,
            extension: normalizedOutput.extension,
            mimeType: normalizedOutput.mimeType,
            fileSizeBytes: stats.size,
            sourceModifiedAt: stats.mtime,
            checksumSha256: checksum,
            changeNote: `Generated by ${normalizedInput.generatorKey}`,
            createdBy: normalizedInput.userId,
          },
        });
        await tx.libraryDocument.update({
          where: { id: doc.id },
          data: {
            currentVersionId: version.id,
            version: nextVersionNo,
            versionLabel: `V${nextVersionNo}`,
          },
        });
      });
      newVersionUid = versionUid;
    } catch (error) {
      await removeManagedVersionFile(managedFile);
      throw error;
    }
  }

  if (newVersionUid) await runUploadedLibraryDocumentPipeline(newVersionUid, normalizedOutput.extension);

  return { document: { id: doc.id, stableKey: doc.stableKey }, isNewVersion };
}

function sanitizePathSegment(s: string): string {
  return s
    .replace(/\\/g, "-")
    .replace(/\//g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/[^\w一-龥.-]/g, "")
    .slice(0, 60);
}

function slug(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w一-龥-]/g, "")
    .slice(0, 50);
}
