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

const GENERATED_DIRECTORY_NAMES: Record<string, string> = {
  generated: "系统生成",
  "generated/contract-ledger": "合同台账",
  "generated/finance-report": "财务报表",
  "generated/organization-chart": "组织架构",
  "generated/ownership-structure": "股权结构",
  "generated/roster-due-diligence": "尽调版花名册",
};

export function generatedDirectoryDisplayNames(generatorKey: string) {
  const leafPath = `generated/${sanitizePathSegment(generatorKey)}`;
  return {
    generated: GENERATED_DIRECTORY_NAMES.generated!,
    [leafPath]: GENERATED_DIRECTORY_NAMES[leafPath] ?? generatorKey,
  };
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
  const titleSlug = slug(normalizedOutput.title);
  const titleHash = crypto.createHash("sha256").update(normalizedOutput.title).digest("hex").slice(0, 8);
  const identityKey = normalizedOutput.identityKey
    ? sanitizePathSegment(normalizedOutput.identityKey) || titleHash
    : `${titleSlug || "untitled"}-${titleHash}`;
  const outputFileName = path.basename(normalizedOutput.fileName);
  const fileName = sanitizePathSegment(outputFileName)
    || `${identityKey}.${normalizedOutput.extension}`;
  const fileSlug = sanitizePathSegment(fileName);
  const generatedFileSlug = normalizedOutput.identityKey
    ? `${identityKey}.${normalizedOutput.extension}`
    : fileSlug;
  const relativePath = path.join("generated", dirSlug, generatedFileSlug);
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
  const stableKey = `generated:${normalizedInput.generatorKey}:${identityKey}`;

  const now = new Date();
  const title = normalizedOutput.title;
  const summary = normalizedOutput.summary ?? normalizedInput.summary;
  const asOfDate = normalizedOutput.asOfDate
    ? new Date(`${normalizedOutput.asOfDate}T00:00:00.000Z`)
    : null;
  const reviewedAt = normalizedOutput.verifiedAt ? new Date(normalizedOutput.verifiedAt) : null;

  const existingDoc = await prisma.libraryDocument.findUnique({ where: { stableKey } });
  const identity = existingDoc
    ? { documentUid: existingDoc.documentUid, docId: existingDoc.docId }
    : createLibraryDocumentIdentity(now);
  const [currentDirectoryId, categoryId] = await Promise.all([
    ensureLibraryDirectory("default", path.dirname(relativePath), {
      displayNames: generatedDirectoryDisplayNames(normalizedInput.generatorKey),
    }),
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
      title,
      summary: summary ?? null,
      categoryCode: normalizedInput.categoryCode ?? null,
      categoryName: normalizedInput.categoryName ?? null,
      categoryId,
      currentDirectoryId,
      confidentialityLevel: normalizedInput.confidentialityLevel,
      status: "active",
      origin: "generated",
      generatorKey: normalizedInput.generatorKey,
      asOfDate,
      reviewStatus: normalizedOutput.reviewStatus ?? "pending",
      reviewedAt,
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
      title,
      summary: summary ?? null,
      categoryCode: normalizedInput.categoryCode ?? null,
      categoryName: normalizedInput.categoryName ?? null,
      categoryId,
      currentDirectoryId,
      confidentialityLevel: normalizedInput.confidentialityLevel,
      status: "active",
      asOfDate,
      reviewStatus: normalizedOutput.reviewStatus ?? "pending",
      reviewedAt,
      reviewedBy: null,
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
