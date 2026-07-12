import { execFile } from "child_process";
import { createHash } from "crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { prisma } from "@workspace/platform/server/prisma";

import { computeChecksumOrThrow } from "./checksum";
import { getDefaultRoot, safeResolve } from "./config";
import {
  buildCreateLibraryExportCommand,
  buildRunLibraryExportCommand,
  type CreateLibraryExportCommand,
  type LibraryExportSelectionItem,
} from "./domain/export-validation";
import { checkLibraryExport, getMaxConfidentialityLevel } from "./permissions";
import { resolveLibraryVersionRuntimeContent } from "./version-content";

const execFileAsync = promisify(execFile);

function workerPython() {
  const configured = process.env.LIBRARY_WORKER_PYTHON?.trim();
  if (configured) return configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured;
  return path.join(os.homedir(), ".cache/workspace-library/venv/bin/python");
}

function safeSegment(value: string, fallback: string) {
  const normalized = value.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return normalized && normalized !== "." && normalized !== ".." ? normalized : fallback;
}

function safeDirectoryPath(value: string | null | undefined) {
  const segments = value?.replace(/\\/g, "/").split("/").filter(Boolean)
    .map((segment) => safeSegment(segment, "未分类")) ?? [];
  return segments.length > 0 ? path.posix.join(...segments) : "未分类";
}

function exportedFileName(originalFileName: string, runtimeFileName: string) {
  const originalExtension = path.extname(originalFileName);
  const runtimeExtension = path.extname(runtimeFileName);
  const name = !runtimeExtension || originalExtension.toLocaleLowerCase() === runtimeExtension.toLocaleLowerCase()
    ? originalFileName
    : `${path.basename(originalFileName, originalExtension)}${runtimeExtension}`;
  return safeSegment(name, "文件");
}

function uniqueFileName(directoryPath: string, fileName: string, usedPaths: Set<string>) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidate = fileName;
  let duplicateIndex = 2;
  while (usedPaths.has(path.posix.join(directoryPath, candidate).toLocaleLowerCase())) {
    candidate = `${baseName} (${duplicateIndex})${extension}`;
    duplicateIndex += 1;
  }
  usedPaths.add(path.posix.join(directoryPath, candidate).toLocaleLowerCase());
  return candidate;
}

async function loadAuthorizedVersions(userId: number, selection: LibraryExportSelectionItem[]) {
  if (!(await checkLibraryExport(userId))) throw new Error("No export permission");
  const maxConfidentialityLevel = await getMaxConfidentialityLevel(userId);
  const versions = await prisma.libraryDocumentVersion.findMany({
    where: { versionUid: { in: selection.map((item) => item.versionUid) } },
    select: {
      id: true,
      versionUid: true,
      fileName: true,
      checksumSha256: true,
      fileSizeBytes: true,
      document: {
        select: {
          documentUid: true,
          docId: true,
          title: true,
          categoryName: true,
          directoryPath: true,
          currentDirectory: { select: { relativePath: true } },
          confidentialityLevel: true,
          status: true,
        },
      },
    },
  });
  const byKey = new Map(versions.map((version) => [`${version.document.documentUid}:${version.versionUid}`, version]));
  return selection.map((item) => {
    const version = byKey.get(`${item.documentUid}:${item.versionUid}`);
    if (!version) throw new Error(`Version not found: ${item.versionUid}`);
    if (version.document.status !== "active") throw new Error(`Document unavailable: ${item.documentUid}`);
    if (version.document.confidentialityLevel > maxConfidentialityLevel) throw new Error("Higher confidentiality required");
    return version;
  });
}

export async function createLibraryExport(command: CreateLibraryExportCommand) {
  const validated = buildCreateLibraryExportCommand(command);
  if (!validated.ok) throw new Error(validated.issue.message);
  await loadAuthorizedVersions(validated.data.userId, validated.data.selection);
  const job = await prisma.libraryExportJob.create({
    data: {
      requestedBy: validated.data.userId,
      selectionJson: JSON.stringify(validated.data.selection),
      optionsJson: JSON.stringify({ includePreviews: validated.data.includePreviews, layout: "directory" }),
    },
  });
  return runLibraryExport(job.exportUid);
}

export async function runLibraryExport(exportUid: string) {
  const validated = buildRunLibraryExportCommand({ exportUid });
  if (!validated.ok) throw new Error(validated.issue.message);
  const job = await prisma.libraryExportJob.findUnique({ where: { exportUid: validated.data.exportUid } });
  if (!job) throw new Error("Export job not found");
  const selection = JSON.parse(job.selectionJson) as LibraryExportSelectionItem[];
  await prisma.libraryExportJob.update({ where: { id: job.id }, data: { status: "running", startedAt: new Date(), errorCode: null, errorMessage: null } });

  const root = getDefaultRoot();
  const exportDir = safeResolve(path.posix.join("exports", exportUid), root);
  const packageDir = exportDir ? safeResolve(path.posix.join("exports", exportUid, "package"), root) : null;
  if (!exportDir || !packageDir) throw new Error("Library runtime root is not configured");

  try {
    const versions = await loadAuthorizedVersions(job.requestedBy, selection);
    const options = JSON.parse(job.optionsJson) as { includePreviews?: boolean };
    await rm(exportDir, { recursive: true, force: true });
    await mkdir(packageDir, { recursive: true });
    const manifestItems = [];
    const checksumLines = [];
    const usedPaths = new Set<string>();

    for (const version of versions) {
      const content = await resolveLibraryVersionRuntimeContent(version.id);
      const actualChecksum = await computeChecksumOrThrow(content.absolutePath);
      if (actualChecksum !== content.checksumSha256) throw new Error(`Checksum mismatch: ${version.versionUid}`);
      const directoryPath = safeDirectoryPath(
        version.document.currentDirectory?.relativePath || version.document.directoryPath,
      );
      const outputName = uniqueFileName(
        directoryPath,
        exportedFileName(version.fileName, content.fileName),
        usedPaths,
      );
      const relativeOutput = path.posix.join(directoryPath, outputName);
      const destination = path.join(packageDir, ...directoryPath.split("/"), outputName);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(content.absolutePath, destination);
      checksumLines.push(`${actualChecksum}  ${relativeOutput}`);
      const preview = options.includePreviews && content.mimeType === "application/pdf"
        ? { kind: "runtime-preview", packagedPath: relativeOutput, checksumSha256: actualChecksum }
        : null;
      manifestItems.push({
        documentUid: version.document.documentUid,
        versionUid: version.versionUid,
        docId: version.document.docId,
        title: version.document.title || version.fileName,
        category: version.document.categoryName || "未分类",
        directoryPath: version.document.currentDirectory?.relativePath || version.document.directoryPath || null,
        confidentialityLevel: version.document.confidentialityLevel,
        originalFileName: version.fileName,
        fileName: content.fileName,
        packagedPath: relativeOutput,
        fileSizeBytes: content.fileSizeBytes,
        checksumSha256: actualChecksum,
        sourceFileSizeBytes: version.fileSizeBytes,
        sourceChecksumSha256: version.checksumSha256,
        preview,
      });
    }

    const manifest = Buffer.from(JSON.stringify({ schemaVersion: "v1", exportUid, createdAt: new Date().toISOString(), items: manifestItems }, null, 2) + "\n");
    const manifestSha256 = createHash("sha256").update(manifest).digest("hex");
    await writeFile(path.join(packageDir, "manifest.json"), manifest);
    await writeFile(path.join(packageDir, "SHA256SUMS"), checksumLines.concat(`${manifestSha256}  manifest.json`).join("\n") + "\n");

    const tempZip = path.join(exportDir, "资料包.tmp.zip");
    const finalZip = path.join(exportDir, "资料包.zip");
    await execFileAsync(workerPython(), [
      path.resolve(process.cwd(), "ops/library-create-zip.py"),
      "--source", packageDir,
      "--output", tempZip,
    ], { timeout: 10 * 60 * 1000 });
    await rename(tempZip, finalZip);
    const zipStat = await stat(finalZip);
    await rm(packageDir, { recursive: true, force: true });
    const storagePath = path.posix.join("exports", exportUid, "资料包.zip");
    return prisma.libraryExportJob.update({
      where: { id: job.id },
      data: { status: "succeeded", storagePath, fileSizeBytes: zipStat.size, manifestSha256, finishedAt: new Date() },
    });
  } catch (error) {
    await prisma.libraryExportJob.update({
      where: { id: job.id },
      data: { status: "failed", errorCode: "export_failed", errorMessage: error instanceof Error ? error.message : "Export failed", finishedAt: new Date() },
    });
    throw error;
  }
}

export async function getLibraryExportFile(exportUid: string, userId: number) {
  const job = await prisma.libraryExportJob.findUnique({ where: { exportUid } });
  if (!job || job.status !== "succeeded" || !job.storagePath) throw new Error("Export not found");
  if (job.requestedBy !== userId) throw new Error("Forbidden");
  await loadAuthorizedVersions(userId, JSON.parse(job.selectionJson) as LibraryExportSelectionItem[]);
  const filePath = safeResolve(job.storagePath, getDefaultRoot());
  if (!filePath) throw new Error("Forbidden");
  const file = await readFile(filePath);
  return { buffer: file, fileName: "资料库.zip", size: file.length, contentType: "application/zip" };
}
