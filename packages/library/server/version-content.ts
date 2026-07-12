import { access, rm, stat } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@workspace/platform/server/prisma";

import { computeChecksumOrThrow } from "./checksum";
import { getDefaultRoot, getDefaultSourceRoot, safeResolve } from "./config";
import { buildLibraryVersionRuntimeStorageCommand } from "./domain/processing-validation";
import { resolveLibraryMimeType } from "./file-facts";
import {
  copyManagedVersionFile,
  getManagedVersionPath,
  isManagedVersionStoragePath,
} from "./version-storage";

type StoredContentFacts = {
  storagePath: string;
  storageFileName: string | null;
  storageMimeType: string | null;
  storageFileSizeBytes: number | null;
  storageChecksumSha256: string | null;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  checksumSha256: string | null;
};

export interface LibraryResolvedContent {
  absolutePath: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
}

async function resolvedFile(input: {
  absolutePath: string | null;
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  checksumSha256?: string | null;
}): Promise<LibraryResolvedContent | null> {
  if (!input.absolutePath) return null;
  try {
    const fileStat = await stat(input.absolutePath);
    if (!fileStat.isFile()) return null;
    if (input.fileSizeBytes != null && input.fileSizeBytes !== fileStat.size) return null;
    const checksumSha256 = await computeChecksumOrThrow(input.absolutePath);
    if (input.checksumSha256 && input.checksumSha256 !== checksumSha256) return null;
    return {
      absolutePath: input.absolutePath,
      storagePath: input.storagePath,
      fileName: input.fileName,
      mimeType: resolveLibraryMimeType(input.fileName, input.mimeType),
      fileSizeBytes: fileStat.size,
      checksumSha256,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function resolveStoredContent(version: StoredContentFacts) {
  return resolvedFile({
    absolutePath: safeResolve(version.storagePath, getDefaultRoot()),
    storagePath: version.storagePath,
    fileName: version.storageFileName || version.fileName,
    mimeType: version.storageMimeType || version.mimeType,
    fileSizeBytes: version.storageFileSizeBytes ?? version.fileSizeBytes,
    checksumSha256: version.storageChecksumSha256 || version.checksumSha256,
  });
}

export async function resolveLibraryVersionRuntimeContent(versionId: number): Promise<LibraryResolvedContent> {
  const version = await prisma.libraryDocumentVersion.findUnique({
    where: { id: versionId },
    select: {
      storagePath: true,
      storageFileName: true,
      storageMimeType: true,
      storageFileSizeBytes: true,
      storageChecksumSha256: true,
      fileName: true,
      mimeType: true,
      fileSizeBytes: true,
      checksumSha256: true,
      artifacts: {
        where: { kind: "preview-pdf", status: "ready" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { storagePath: true, mimeType: true, fileSizeBytes: true, checksumSha256: true },
      },
    },
  });
  if (!version) throw new Error("Library version not found");

  const stored = await resolveStoredContent(version);
  if (stored) return stored;

  const preview = version.artifacts[0];
  if (preview) {
    const content = await resolvedFile({
      absolutePath: safeResolve(preview.storagePath, getDefaultRoot()),
      storagePath: preview.storagePath,
      fileName: `${path.parse(version.fileName).name || "document"}.pdf`,
      mimeType: preview.mimeType || "application/pdf",
      fileSizeBytes: preview.fileSizeBytes,
      checksumSha256: preview.checksumSha256,
    });
    if (content) return content;
  }
  throw new Error("Library runtime content unavailable");
}

export async function resolveLibraryVersionProcessingInput(
  versionUid: string,
  options: { preferRuntimeContent?: boolean } = {},
) {
  const version = await prisma.libraryDocumentVersion.findUnique({
    where: { versionUid },
    include: {
      document: { select: { documentUid: true, status: true, origin: true, rootKey: true } },
    },
  });
  if (!version?.checksumSha256) throw new Error("Library version and checksum are required");

  if (options.preferRuntimeContent) {
    try {
      const runtime = await resolveLibraryVersionRuntimeContent(version.id);
      if (runtime.mimeType === "application/pdf") {
        return { version, input: runtime, inputKind: "runtime-content" as const };
      }
    } catch {
      // Preview may not exist yet; fall through to the original ingestion source.
    }
  }

  if (isManagedVersionStoragePath(version.storagePath)) {
    const managed = await resolvedFile({
      absolutePath: safeResolve(version.storagePath, getDefaultRoot()),
      storagePath: version.storagePath,
      fileName: version.fileName,
      mimeType: version.mimeType,
      fileSizeBytes: version.fileSizeBytes,
      checksumSha256: version.checksumSha256,
    });
    if (managed) return { version, input: managed, inputKind: "managed-original" as const };
  }

  if (version.document.origin === "scanned") {
    const sourceRoot = getDefaultSourceRoot();
    const source = sourceRoot
      ? await resolvedFile({
        absolutePath: safeResolve(version.relativePath, sourceRoot),
        storagePath: version.relativePath,
        fileName: version.fileName,
        mimeType: version.mimeType,
        fileSizeBytes: version.fileSizeBytes,
        checksumSha256: version.checksumSha256,
      })
      : null;
    if (source) return { version, input: source, inputKind: "external-source" as const };
  }

  const runtime = await resolveLibraryVersionRuntimeContent(version.id);
  return { version, input: runtime, inputKind: "runtime-content" as const };
}

export async function promoteLibraryVersionToCompactRuntime(versionId: number) {
  const validated = buildLibraryVersionRuntimeStorageCommand({ versionId });
  if (!validated.ok) throw new Error(validated.issue.message);
  const version = await prisma.libraryDocumentVersion.findUnique({
    where: { id: validated.data.versionId },
    include: {
      document: { select: { origin: true, relativePath: true } },
      artifacts: {
        where: { status: "ready", kind: { in: ["preview-pdf", "markdown", "thumbnail"] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });
  if (!version) throw new Error("Library version not found");
  const preview = version.artifacts.find((artifact) => artifact.kind === "preview-pdf");
  const markdown = version.artifacts.find((artifact) => artifact.kind === "markdown");
  if (!preview || !markdown) return { promoted: false, reason: "preview_and_markdown_required" as const };

  const compact = await resolvedFile({
    absolutePath: safeResolve(preview.storagePath, getDefaultRoot()),
    storagePath: preview.storagePath,
    fileName: `${path.parse(version.fileName).name || "document"}.pdf`,
    mimeType: preview.mimeType || "application/pdf",
    fileSizeBytes: preview.fileSizeBytes,
    checksumSha256: preview.checksumSha256,
  });
  if (!compact) throw new Error("Compact preview artifact invalid");

  const previousStoragePath = version.storagePath;
  await prisma.libraryDocumentVersion.update({
    where: { id: version.id },
    data: {
      storagePath: compact.storagePath,
      storageFileName: compact.fileName,
      storageMimeType: compact.mimeType,
      storageFileSizeBytes: compact.fileSizeBytes,
      storageChecksumSha256: compact.checksumSha256,
    },
  });

  if (previousStoragePath !== compact.storagePath && isManagedVersionStoragePath(previousStoragePath)) {
    const previousPath = safeResolve(previousStoragePath, getDefaultRoot());
    if (previousPath) await rm(path.dirname(previousPath), { recursive: true, force: true });
  }
  if (version.document.origin === "generated") {
    const generatedPath = version.document.relativePath.replace(/\\/g, "/");
    if (generatedPath.startsWith("generated/")) {
      const absoluteGeneratedPath = safeResolve(generatedPath, getDefaultRoot());
      if (absoluteGeneratedPath && absoluteGeneratedPath !== compact.absolutePath) await rm(absoluteGeneratedPath, { force: true });
    }
  }

  const thumbnails = version.artifacts.filter((artifact) => artifact.kind === "thumbnail");
  if (thumbnails.length > 0) {
    await prisma.libraryArtifact.deleteMany({ where: { id: { in: thumbnails.map((artifact) => artifact.id) } } });
    for (const thumbnail of thumbnails) {
      const thumbnailPath = safeResolve(thumbnail.storagePath, getDefaultRoot());
      if (thumbnailPath) await rm(thumbnailPath, { force: true });
    }
  }
  return { promoted: true, storagePath: compact.storagePath, removedThumbnails: thumbnails.length };
}

export async function retainLibraryVersionOriginal(versionId: number) {
  const validated = buildLibraryVersionRuntimeStorageCommand({ versionId });
  if (!validated.ok) throw new Error(validated.issue.message);
  const version = await prisma.libraryDocumentVersion.findUnique({
    where: { id: validated.data.versionId },
    include: { document: { select: { documentUid: true, origin: true } } },
  });
  if (!version?.checksumSha256) throw new Error("Library version and checksum are required");

  const processing = await resolveLibraryVersionProcessingInput(version.versionUid);
  if (processing.inputKind === "runtime-content" && processing.input.checksumSha256 !== version.checksumSha256) {
    throw new Error("Original source unavailable for retained Library version");
  }
  const managedPath = getManagedVersionPath(version.document.documentUid, version.versionUid, version.fileName);
  let managed = await resolvedFile({
    absolutePath: safeResolve(managedPath, getDefaultRoot()),
    storagePath: managedPath,
    fileName: version.fileName,
    mimeType: version.mimeType,
    fileSizeBytes: version.fileSizeBytes,
    checksumSha256: version.checksumSha256,
  });
  if (!managed) {
    await copyManagedVersionFile({
      documentUid: version.document.documentUid,
      versionUid: version.versionUid,
      fileName: version.fileName,
      sourceAbsolutePath: processing.input.absolutePath,
    });
    managed = await resolvedFile({
      absolutePath: safeResolve(managedPath, getDefaultRoot()),
      storagePath: managedPath,
      fileName: version.fileName,
      mimeType: version.mimeType,
      fileSizeBytes: version.fileSizeBytes,
      checksumSha256: version.checksumSha256,
    });
  }
  if (!managed) throw new Error("Retained Library original validation failed");
  await prisma.libraryDocumentVersion.update({
    where: { id: version.id },
    data: {
      storagePath: managed.storagePath,
      storageFileName: managed.fileName,
      storageMimeType: managed.mimeType,
      storageFileSizeBytes: managed.fileSizeBytes,
      storageChecksumSha256: managed.checksumSha256,
    },
  });
  await access(managed.absolutePath);
  return managed;
}
