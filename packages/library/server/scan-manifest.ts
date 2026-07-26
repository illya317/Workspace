import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveLibraryMimeType } from "./file-facts";
import { buildWriteLibraryScanManifestCommand } from "./domain/scan-validation";

const SKIP_NAMES = new Set([".DS_Store"]);
const SKIP_ROOT_DIRS = new Set(["generated"]);
const MANIFEST_ROOT = ".manifests/scans";

export interface ScanFileInfo {
  absolutePath: string;
  relativePath: string;
  directoryPath: string;
  fileName: string;
  extension: string;
  mimeType: string;
  size: number;
  mtime: Date;
  categoryCode?: string;
  categoryName?: string;
}

export interface ScanManifestEntry {
  relativePath: string;
  fileName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  sourceModifiedAt: string;
  checksumSha256: string | null;
  status: "pending" | "created" | "updated" | "unchanged" | "managed-skip" | "failed";
  documentUid?: string;
  versionUid?: string;
  duplicateOfVersionUid?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface DirectoryScanError {
  relativePath: string;
  errorCode: "directory_unreadable" | "entry_unsupported" | "file_stat_failed";
  message: string;
}

function parseCategory(dirName: string) {
  const match = dirName.match(/^(\d+)\s+(.+)$/);
  return match ? { code: match[1], name: match[2].trim() } : undefined;
}

function fileExtension(fileName: string) {
  return path.extname(fileName).slice(1).toLowerCase();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function collectLibraryScanFiles(root: string) {
  const files: ScanFileInfo[] = [];
  const errors: DirectoryScanError[] = [];

  async function collect(dir: string, categoryCode?: string, categoryName?: string): Promise<void> {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      errors.push({
        relativePath: path.relative(root, dir) || ".",
        errorCode: "directory_unreadable",
        message: errorMessage(error),
      });
      return;
    }

    for (const entry of items) {
      if (entry.name.startsWith(".") || SKIP_NAMES.has(entry.name)) continue;
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath);
      if (entry.isDirectory()) {
        if (dir === root && SKIP_ROOT_DIRS.has(entry.name)) continue;
        const parsed = parseCategory(entry.name);
        await collect(absolutePath, parsed?.code ?? categoryCode, parsed?.name ?? categoryName);
        continue;
      }
      if (!entry.isFile()) {
        errors.push({ relativePath, errorCode: "entry_unsupported", message: "Only regular files are indexed" });
        continue;
      }
      try {
        const fileStat = await stat(absolutePath);
        const extension = fileExtension(entry.name);
        files.push({
          absolutePath,
          relativePath,
          directoryPath: path.dirname(relativePath),
          fileName: entry.name,
          extension,
          mimeType: resolveLibraryMimeType(entry.name, ""),
          size: fileStat.size,
          mtime: fileStat.mtime,
          categoryCode,
          categoryName,
        });
      } catch (error) {
        errors.push({ relativePath, errorCode: "file_stat_failed", message: errorMessage(error) });
      }
    }
  }

  await collect(root);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh"));
  return { files, errors };
}

export async function writeLibraryScanManifest(input: {
  root: string;
  rootKey: string;
  entries: ScanManifestEntry[];
  directoryErrors: DirectoryScanError[];
  missingDocumentUids: string[];
}) {
  const validated = buildWriteLibraryScanManifestCommand({
    runtimeRoot: input.root,
    rootKey: input.rootKey,
    entryCount: input.entries.length,
  });
  if (!validated.ok) throw new Error(validated.issue.message);
  const manifestUid = randomUUID();
  const payload = {
    manifestVersion: "v1",
    manifestUid,
    rootKey: input.rootKey,
    createdAt: new Date().toISOString(),
    eligibleFileCount: input.entries.length,
    directoryErrorCount: input.directoryErrors.length,
    missingDocumentCount: input.missingDocumentUids.length,
    entries: input.entries,
    directoryErrors: input.directoryErrors,
    missingDocumentUids: input.missingDocumentUids,
  };
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  const checksumSha256 = createHash("sha256").update(content).digest("hex");
  const relativePath = path.posix.join(MANIFEST_ROOT, `${manifestUid}.json`);
  const absolutePath = path.join(input.root, ...relativePath.split("/"));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, content, { flag: "wx" });
    await rename(temporaryPath, absolutePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
  return { manifestUid, checksumSha256, relativePath };
}
