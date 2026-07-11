/**
 * 资料库扫描服务 — Phase 2
 * 递归扫描 LIBRARY_ROOT 文件系统，同步 LibraryDocument / LibraryDocumentVersion。
 */
import { readdir, stat } from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import { prisma } from "@workspace/platform/server/prisma";
import { getLibraryRoots, safeResolve } from "./config";
import { computeChecksum } from "./checksum";
import { createLibraryDocumentIdentity } from "./domain/document-identity";
import { ensureLibraryCategory, ensureLibraryDirectory } from "./classification";
import { buildScanLibraryCommand } from "./domain/scan-validation";
import { copyManagedVersionFile, removeManagedVersionFile } from "./version-storage";

export interface ScanResult {
  scanned: number;
  created: number;
  updated: number;
  missing: number;
  errors: string[];
}

interface FileInfo {
  absolutePath: string;
  relativePath: string;
  directoryPath: string;
  fileName: string;
  extension: string;
  size: number;
  mtime: Date;
  categoryCode?: string;
  categoryName?: string;
}

const SKIP_NAMES = new Set([".DS_Store"]);
const SKIP_DIRS = new Set(["generated"]);

function parseCategory(dirName: string): { code: string; name: string } | undefined {
  const m = dirName.match(/^(\d+)\s+(.+)$/);
  if (!m) return undefined;
  return { code: m[1], name: m[2].trim() };
}

function getExtension(fileName: string): string {
  const ext = path.extname(fileName);
  return ext ? ext.slice(1).toLowerCase() : "";
}

async function collectFiles(
  root: string,
  dir: string,
  categoryCode?: string,
  categoryName?: string,
): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  let items: { name: string; isDirectory(): boolean; isFile(): boolean }[];
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch (_e) {
    return files;
  }

  for (const entry of items) {
    if (entry.name.startsWith(".") || SKIP_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // 只在根目录跳过 generated/，避免误跳原始资料里的普通 generated 目录
      if (dir === root && SKIP_DIRS.has(entry.name)) continue;
      const cat = parseCategory(entry.name);
      const childFiles = await collectFiles(
        root,
        full,
        cat?.code ?? categoryCode,
        cat?.name ?? categoryName,
      );
      files.push(...childFiles);
      continue;
    }

    if (!entry.isFile()) continue;

    let s: Awaited<ReturnType<typeof stat>>;
    try {
      s = await stat(full);
    } catch {
      continue;
    }

    const rel = path.relative(root, full);
    files.push({
      absolutePath: full,
      relativePath: rel,
      directoryPath: path.dirname(rel),
      fileName: entry.name,
      extension: getExtension(entry.name),
      size: s.size,
      mtime: s.mtime,
      categoryCode,
      categoryName,
    });
  }

  return files;
}

function hasChanged(doc: { fileSizeBytes: number | null; fileMtime: Date | null; checksumSha256: string | null }, info: FileInfo): boolean {
  if (doc.fileSizeBytes !== info.size) return true;
  return Math.abs((doc.fileMtime?.getTime() ?? 0) - info.mtime.getTime()) > 1000;
}

const normalizeDirPath = (p: string): string | null => p === "." ? null : p;

export async function scanLibrary(rootKey?: string): Promise<ScanResult> {
  const command = buildScanLibraryCommand(rootKey);
  if (!command.ok) {
    return { scanned: 0, created: 0, updated: 0, missing: 0, errors: [command.issue.message] };
  }
  const key = command.data.rootKey;
  const roots = getLibraryRoots();
  const root = roots[0];
  if (!root) {
    return { scanned: 0, created: 0, updated: 0, missing: 0, errors: ["LIBRARY_ROOT not set"] };
  }

  const resolved = safeResolve("", root);
  if (!resolved) {
    return { scanned: 0, created: 0, updated: 0, missing: 0, errors: [`Invalid root: ${root}`] };
  }

  const result: ScanResult = { scanned: 0, created: 0, updated: 0, missing: 0, errors: [] };

  // ── Phase 1: 收集文件 ──────────────────────────────────────
  let files: FileInfo[];
  try {
    files = await collectFiles(resolved, resolved);
  } catch (_e) {
    result.errors.push(`Collect failed: ${_e instanceof Error ? _e.message : String(_e)}`);
    return result;
  }

  const scannedStableKeys = new Set<string>();
  for (const info of files) {
    scannedStableKeys.add(`${key}:${info.relativePath}`);
  }

  // ── Phase 2: 先把本轮未命中的旧 scanned active 标记为 missing ───
  // 只处理 origin="scanned"，避免误标 generated/uploaded/manual 文档
  try {
    const oldActiveDocs = await prisma.libraryDocument.findMany({
      where: { rootKey: key, status: "active", origin: "scanned" },
      select: { id: true, stableKey: true },
    });
    const toMarkMissing = oldActiveDocs.filter((d) => !scannedStableKeys.has(d.stableKey));
    for (const doc of toMarkMissing) {
      try {
        await prisma.libraryDocument.update({
          where: { id: doc.id },
          data: { status: "missing", updatedAt: new Date() },
        });
        result.missing++;
      } catch (_e) {
        result.errors.push(`mark-missing ${doc.stableKey}: ${_e instanceof Error ? _e.message : String(_e)}`);
      }
    }
  } catch (_e) {
    result.errors.push(`Missing check: ${_e instanceof Error ? _e.message : String(_e)}`);
  }

  // ── Phase 3: 逐个处理文件（同路径更新；新路径创建新身份，不按 checksum 自动合并）
  for (const info of files) {
    const stableKey = `${key}:${info.relativePath}`;
    result.scanned++;

    const checksum = await computeChecksum(info.absolutePath);

    try {
      const [currentDirectoryId, categoryId] = await Promise.all([
        ensureLibraryDirectory(key, info.directoryPath),
        ensureLibraryCategory(info.categoryCode, info.categoryName),
      ]);
      const existing = await prisma.libraryDocument.findUnique({ where: { stableKey } });

      if (existing) {
        // Uploaded/generated/manual documents own their current bytes through their service seam.
        // A stale file left at the same logical path must not replace the managed current version.
        if (existing.origin !== "scanned") continue;
        if (hasChanged(existing, info) || existing.checksumSha256 !== checksum) {
          const latestVersion = await prisma.libraryDocumentVersion.findFirst({
            where: { documentId: existing.id },
            orderBy: { versionNo: "desc" },
          });
          const nextVersion = (latestVersion?.versionNo ?? 0) + 1;
          const versionUid = randomUUID();
          const managedFile = await copyManagedVersionFile({
            documentUid: existing.documentUid,
            versionUid,
            fileName: info.fileName,
            sourceAbsolutePath: info.absolutePath,
          });
          try {
            await prisma.$transaction(async (tx) => {
              const version = await tx.libraryDocumentVersion.create({
                data: {
                  versionUid,
                  documentId: existing.id,
                  versionNo: nextVersion,
                  versionLabel: `V${nextVersion}`,
                  fileName: info.fileName,
                  storagePath: managedFile.relativePath,
                  relativePath: info.relativePath,
                  extension: info.extension || null,
                  fileSizeBytes: info.size,
                  sourceModifiedAt: info.mtime,
                  checksumSha256: checksum,
                },
              });
              await tx.libraryDocument.update({
                where: { id: existing.id },
                data: {
                  fileName: info.fileName,
                  extension: info.extension || null,
                  fileSizeBytes: info.size,
                  fileMtime: info.mtime,
                  checksumSha256: checksum,
                  directoryPath: normalizeDirPath(info.directoryPath),
                  currentDirectoryId,
                  categoryId,
                  currentVersionId: version.id,
                  version: nextVersion,
                  versionLabel: `V${nextVersion}`,
                  status: "active",
                },
              });
            });
          } catch (error) {
            await removeManagedVersionFile(managedFile);
            throw error;
          }
          result.updated++;
        } else if (existing.currentDirectoryId !== currentDirectoryId || existing.categoryId !== categoryId) {
          await prisma.libraryDocument.update({
            where: { id: existing.id },
            data: { currentDirectoryId, categoryId },
          });
        }
        continue;
      }

      const identity = createLibraryDocumentIdentity();
      const versionUid = randomUUID();
      const managedFile = await copyManagedVersionFile({
        documentUid: identity.documentUid,
        versionUid,
        fileName: info.fileName,
        sourceAbsolutePath: info.absolutePath,
      });
      try {
        await prisma.$transaction(async (tx) => {
          const document = await tx.libraryDocument.create({
            data: {
              ...identity,
              stableKey, rootKey: key, relativePath: info.relativePath, fileName: info.fileName,
              extension: info.extension || null, fileSizeBytes: info.size, fileMtime: info.mtime,
              checksumSha256: checksum, categoryCode: info.categoryCode || null,
              categoryName: info.categoryName || null, directoryPath: normalizeDirPath(info.directoryPath),
              categoryId, currentDirectoryId, status: "active", origin: "scanned",
              version: 1, versionLabel: "V1",
            },
          });
          const version = await tx.libraryDocumentVersion.create({
            data: {
              versionUid,
              documentId: document.id,
              versionNo: 1,
              versionLabel: "V1",
              fileName: info.fileName,
              storagePath: managedFile.relativePath,
              relativePath: info.relativePath,
              extension: info.extension || null,
              fileSizeBytes: info.size,
              sourceModifiedAt: info.mtime,
              checksumSha256: checksum,
              changeNote: "Initial scanned version",
            },
          });
          await tx.libraryDocument.update({
            where: { id: document.id },
            data: { currentVersionId: version.id },
          });
        });
      } catch (error) {
        await removeManagedVersionFile(managedFile);
        throw error;
      }
      result.created++;
    } catch (_e) {
      result.errors.push(`${stableKey}: ${_e instanceof Error ? _e.message : String(_e)}`);
    }
  }

  return result;
}
