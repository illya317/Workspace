/**
 * 资料库扫描服务 — Phase 2
 * 递归扫描 LIBRARY_ROOT 文件系统，同步 LibraryDocument / LibraryDocumentVersion。
 */
import { readdir, stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getLibraryRoots, safeResolve } from "./config";

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

function hasChanged(doc: {
  fileSizeBytes: number | null;
  fileMtime: Date | null;
  checksumSha256: string | null;
}, info: FileInfo): boolean {
  if (doc.fileSizeBytes !== info.size) return true;
  const docMtime = doc.fileMtime?.getTime() ?? 0;
  const infoMtime = info.mtime.getTime();
  if (Math.abs(docMtime - infoMtime) > 1000) return true;
  return false;
}

export async function scanLibrary(rootKey?: string): Promise<ScanResult> {
  const key = rootKey || "default";
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
  const scannedStableKeys = new Set<string>();

  let files: FileInfo[];
  try {
    files = await collectFiles(resolved, resolved);
  } catch (_e) {
    result.errors.push(`Collect failed: ${_e instanceof Error ? _e.message : String(_e)}`);
    return result;
  }

  for (const info of files) {
    const stableKey = `${key}:${info.relativePath}`;
    scannedStableKeys.add(stableKey);
    result.scanned++;

    try {
      const existing = await prisma.libraryDocument.findUnique({
        where: { stableKey },
      });

      if (existing) {
        if (hasChanged(existing, info)) {
          const nextVersion = existing.version + 1;
          await prisma.libraryDocumentVersion.create({
            data: {
              documentId: existing.id,
              versionNo: nextVersion,
              relativePath: info.relativePath,
              fileSizeBytes: info.size,
              fileMtime: info.mtime,
              checksumSha256: null,
            },
          });
          await prisma.libraryDocument.update({
            where: { id: existing.id },
            data: {
              fileSizeBytes: info.size,
              fileMtime: info.mtime,
              checksumSha256: null,
              directoryPath: info.directoryPath === "." ? null : info.directoryPath,
              version: nextVersion,
              status: "active",
              updatedAt: new Date(),
            },
          });
          result.updated++;
        }
        continue;
      }

      await prisma.libraryDocument.create({
        data: {
          stableKey,
          rootKey: key,
          relativePath: info.relativePath,
          fileName: info.fileName,
          extension: info.extension || null,
          fileSizeBytes: info.size,
          fileMtime: info.mtime,
          checksumSha256: null,
          categoryCode: info.categoryCode || null,
          categoryName: info.categoryName || null,
          directoryPath: info.directoryPath === "." ? null : info.directoryPath,
          status: "active",
          origin: "scanned",
          version: 1,
        },
      });
      result.created++;
    } catch (_e) {
      result.errors.push(`${stableKey}: ${_e instanceof Error ? _e.message : String(_e)}`);
    }
  }

  try {
    const missingDocs = await prisma.libraryDocument.findMany({
      where: {
        rootKey: key,
        status: "active",
      },
      select: { id: true, stableKey: true },
    });

    const toMarkMissing = missingDocs.filter((d) => !scannedStableKeys.has(d.stableKey));
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

  return result;
}
