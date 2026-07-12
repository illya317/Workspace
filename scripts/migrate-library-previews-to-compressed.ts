import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readdir, readFile, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const execute = args.includes("--execute");

function argument(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function databasePath() {
  const explicit = argument("--db");
  const configured = explicit || process.env.DATABASE_URL?.replace(/^file:/, "");
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error("Use --db <absolute-path> or configure an absolute DATABASE_URL");
  }
  return configured;
}

function libraryRoot() {
  const configured = argument("--root") || process.env.LIBRARY_ROOT;
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error("Use --root <absolute-path> or configure an absolute LIBRARY_ROOT");
  }
  return path.resolve(configured);
}

function pythonPath() {
  const configured = process.env.LIBRARY_WORKER_PYTHON?.trim();
  if (configured) return configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured;
  return path.join(os.homedir(), ".cache/workspace-library/venv/bin/python");
}

function safeStoragePath(root: string, storagePath: string) {
  const resolved = path.resolve(root, storagePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe artifact path: ${storagePath}`);
  return resolved;
}

async function sha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

type Candidate = {
  documentUid: string;
  versionUid: string;
  versionId: number;
  previewArtifactId: number;
  previewJobId: number | null;
  previewPath: string;
  previewBytes: number;
  previewChecksum: string;
  previewPageCount: number | null;
  compressedArtifactId: number | null;
  compressedJobId: number | null;
  compressedPath: string | null;
  compressedBytes: number | null;
  compressedChecksum: string | null;
  compressedPageCount: number | null;
};

type WorkerResult = {
  compressionRetained: boolean;
  compressionSavingsRatio: number;
  visualRms: number;
  textLayerMatches: boolean | null;
  pageCount: number;
  artifacts: Array<{
    kind: "preview-pdf" | "thumbnail";
    fileName: string;
    fileSizeBytes: number;
    checksumSha256: string;
    pageCount: number | null;
  }>;
  warnings: string[];
};

async function validateFile(filePath: string, expectedBytes: number, expectedChecksum: string) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile() || fileStat.size !== expectedBytes) throw new Error(`Artifact size mismatch: ${filePath}`);
  if (await sha256(filePath) !== expectedChecksum) throw new Error(`Artifact checksum mismatch: ${filePath}`);
}

async function listPdfFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const results: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await listPdfFiles(entryPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) results.push(entryPath);
  }
  return results;
}

async function runPool<T>(items: T[], concurrency: number, handler: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await handler(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const dbPath = databasePath();
  const root = libraryRoot();
  const minMiB = Number(argument("--min-mib") || "1");
  const concurrency = Number(argument("--concurrency") || "2");
  const limit = Number(argument("--limit") || "0");
  if (!Number.isFinite(minMiB) || minMiB < 0) throw new Error("--min-mib must be non-negative");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error("--concurrency must be 1..4");
  if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer");
  await access(dbPath);
  await access(root);

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  const threshold = Math.round(minMiB * 1024 * 1024);
  const rows = db.prepare(`
    WITH previews AS (
      SELECT a.*,
        ROW_NUMBER() OVER (PARTITION BY a.versionId ORDER BY a.createdAt DESC, a.id DESC) AS rn
      FROM LibraryArtifact a
      JOIN LibraryDocument d ON d.currentVersionId = a.versionId
      WHERE d.status = 'active' AND a.kind = 'preview-pdf' AND a.status = 'ready'
    ), compressed AS (
      SELECT a.*,
        ROW_NUMBER() OVER (PARTITION BY a.versionId ORDER BY a.createdAt DESC, a.id DESC) AS rn
      FROM LibraryArtifact a
      JOIN LibraryDocument d ON d.currentVersionId = a.versionId
      WHERE d.status = 'active' AND a.kind = 'compressed-pdf' AND a.status = 'ready'
    )
    SELECT d.documentUid, v.versionUid, v.id AS versionId,
      p.id AS previewArtifactId, p.jobId AS previewJobId,
      p.storagePath AS previewPath, p.fileSizeBytes AS previewBytes,
      p.checksumSha256 AS previewChecksum, p.pageCount AS previewPageCount,
      c.id AS compressedArtifactId, c.jobId AS compressedJobId,
      c.storagePath AS compressedPath, c.fileSizeBytes AS compressedBytes,
      c.checksumSha256 AS compressedChecksum, c.pageCount AS compressedPageCount
    FROM LibraryDocument d
    JOIN LibraryDocumentVersion v ON v.id = d.currentVersionId
    JOIN previews p ON p.versionId = v.id AND p.rn = 1
    LEFT JOIN compressed c ON c.versionId = v.id AND c.rn = 1
    WHERE d.status = 'active' AND lower(COALESCE(v.extension, '')) = 'pdf' AND (
      c.id IS NOT NULL OR (
        p.fileSizeBytes >= ?
        AND COALESCE(json_extract(p.toolchainJson, '$.previewVersion'), '') <> 'v2-compressed'
      )
    )
    ORDER BY (c.id IS NOT NULL) DESC, p.fileSizeBytes DESC
  `).all(threshold) as Candidate[];
  const candidates = limit > 0 ? rows.slice(0, limit) : rows;
  const reusable = candidates.filter((row) => row.compressedArtifactId !== null);
  const algorithmic = candidates.filter((row) => row.compressedArtifactId === null);
  const inputBytes = candidates.reduce((sum, row) => sum + row.previewBytes, 0);
  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    candidates: candidates.length,
    reuseExistingCompressed: reusable.length,
    algorithmicCompression: algorithmic.length,
    inputGiB: Number((inputBytes / 1024 / 1024 / 1024).toFixed(3)),
    minMiB,
    concurrency,
  }, null, 2));
  if (!execute) {
    db.close();
    return;
  }

  const backupPath = `${dbPath}.library-preview-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  await db.backup(backupPath);
  console.error(`[library-preview-migrate] database backup: ${backupPath}`);

  const updatePreview = db.prepare(`
    UPDATE LibraryArtifact
    SET jobId = ?, status = 'ready', storagePath = ?, mimeType = 'application/pdf',
        fileSizeBytes = ?, checksumSha256 = ?, pageCount = ?, toolchainJson = ?
    WHERE id = ?
  `);
  const retireOtherPreviews = db.prepare(`
    UPDATE LibraryArtifact SET status = 'retired'
    WHERE versionId = ? AND kind = 'preview-pdf' AND id <> ? AND status = 'ready'
  `);
  const retireCompressed = db.prepare(`
    UPDATE LibraryArtifact SET status = 'retired' WHERE id = ? AND kind = 'compressed-pdf'
  `);
  const oldPreviewPaths = db.prepare(`
    SELECT storagePath FROM LibraryArtifact WHERE versionId = ? AND kind = 'preview-pdf' AND status = 'ready'
  `);
  const readyPathCount = db.prepare(`SELECT COUNT(*) AS count FROM LibraryArtifact WHERE status = 'ready' AND storagePath = ?`);
  const promote = db.transaction((input: {
    row: Candidate;
    jobId: number | null;
    storagePath: string;
    fileSizeBytes: number;
    checksumSha256: string;
    pageCount: number | null;
    toolchainJson: string;
  }) => {
    updatePreview.run(
      input.jobId,
      input.storagePath,
      input.fileSizeBytes,
      input.checksumSha256,
      input.pageCount,
      input.toolchainJson,
      input.row.previewArtifactId,
    );
    retireOtherPreviews.run(input.row.versionId, input.row.previewArtifactId);
    if (input.row.compressedArtifactId !== null) retireCompressed.run(input.row.compressedArtifactId);
  });

  let reused = 0;
  let compressed = 0;
  let retainedOld = 0;
  let failed = 0;
  let freedBytes = 0;

  async function deleteReplaced(paths: string[], activePath: string) {
    for (const storagePath of new Set(paths)) {
      if (storagePath === activePath) continue;
      const reference = readyPathCount.get(storagePath) as { count: number };
      if (reference.count > 0) continue;
      const absolutePath = safeStoragePath(root, storagePath);
      const fileStat = await stat(absolutePath).catch(() => null);
      if (!fileStat?.isFile()) continue;
      await rm(absolutePath, { force: true });
      freedBytes += fileStat.size;
    }
  }

  await runPool(candidates, concurrency, async (row, index) => {
    const previousPaths = (oldPreviewPaths.all(row.versionId) as Array<{ storagePath: string }>).map((item) => item.storagePath);
    let temporaryOutput: string | null = null;
    try {
      if (row.compressedPath && row.compressedBytes !== null && row.compressedChecksum) {
        const compressedPath = safeStoragePath(root, row.compressedPath);
        await validateFile(compressedPath, row.compressedBytes, row.compressedChecksum);
        if (row.previewPageCount !== null && row.compressedPageCount !== null && row.previewPageCount !== row.compressedPageCount) {
          throw new Error("Existing compressed artifact page count differs from preview");
        }
        promote({
          row,
          jobId: row.compressedJobId,
          storagePath: row.compressedPath,
          fileSizeBytes: row.compressedBytes,
          checksumSha256: row.compressedChecksum,
          pageCount: row.compressedPageCount,
          toolchainJson: JSON.stringify({ previewVersion: "v2-compressed", migration: "reuse-existing-compressed" }),
        });
        await deleteReplaced(previousPaths, row.compressedPath);
        reused++;
      } else {
        const inputPath = safeStoragePath(root, row.previewPath);
        await validateFile(inputPath, row.previewBytes, row.previewChecksum);
        const relativeOutput = path.posix.join(
          "artifacts",
          row.documentUid,
          row.versionUid,
          "preview-v2-compressed",
          `migration-${randomUUID()}`,
        );
        temporaryOutput = safeStoragePath(root, relativeOutput);
        await execFileAsync(pythonPath(), [
          path.resolve(process.cwd(), "ops/library-preview-document.py"),
          "--input", inputPath,
          "--output-dir", temporaryOutput,
          "--input-checksum", row.previewChecksum,
          "--preview-version", "v2-compressed",
        ], { timeout: 30 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
        const result = JSON.parse(await readFile(path.join(temporaryOutput, "result.json"), "utf8")) as WorkerResult;
        if (!result.compressionRetained) {
          promote({
            row,
            jobId: row.previewJobId,
            storagePath: row.previewPath,
            fileSizeBytes: row.previewBytes,
            checksumSha256: row.previewChecksum,
            pageCount: row.previewPageCount,
            toolchainJson: JSON.stringify({
              previewVersion: "v2-compressed",
              migration: "retained-old-insufficient-savings-or-visual-quality",
              savingsRatio: result.compressionSavingsRatio,
              visualRms: result.visualRms,
              warnings: result.warnings,
            }),
          });
          await rm(temporaryOutput, { recursive: true, force: true });
          retainedOld++;
          console.error(`[library-preview-migrate] ${index + 1}/${candidates.length} retained old preview (no safe savings)`);
          return;
        }
        const artifact = result.artifacts.find((item) => item.kind === "preview-pdf");
        if (!artifact) throw new Error("Worker did not return preview-pdf");
        const newStoragePath = path.posix.join(relativeOutput, artifact.fileName);
        const newAbsolutePath = safeStoragePath(root, newStoragePath);
        await validateFile(newAbsolutePath, artifact.fileSizeBytes, artifact.checksumSha256);
        promote({
          row,
          jobId: row.previewJobId,
          storagePath: newStoragePath,
          fileSizeBytes: artifact.fileSizeBytes,
          checksumSha256: artifact.checksumSha256,
          pageCount: artifact.pageCount,
          toolchainJson: JSON.stringify({
            previewVersion: "v2-compressed",
            migration: "compress-existing-preview",
            savingsRatio: result.compressionSavingsRatio,
            visualRms: result.visualRms,
            textLayerMatches: result.textLayerMatches,
            warnings: result.warnings,
          }),
        });
        await rm(path.join(temporaryOutput, "thumbnail.png"), { force: true });
        await rm(path.join(temporaryOutput, "result.json"), { force: true });
        await deleteReplaced(previousPaths, newStoragePath);
        compressed++;
      }
      console.error(`[library-preview-migrate] ${index + 1}/${candidates.length} ${reused ? `reused=${reused}` : ""} compressed=${compressed}`);
    } catch (error) {
      failed++;
      if (temporaryOutput) await rm(temporaryOutput, { recursive: true, force: true }).catch(() => undefined);
      console.error(`[library-preview-migrate] ${index + 1}/${candidates.length} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const readyPdfPaths = new Set(
    (db.prepare(`SELECT storagePath FROM LibraryArtifact WHERE status = 'ready' AND lower(storagePath) LIKE '%.pdf'`).all() as Array<{ storagePath: string }>)
      .map((row) => path.posix.normalize(row.storagePath)),
  );
  let orphanFiles = 0;
  let orphanBytes = 0;
  for (const filePath of await listPdfFiles(path.join(root, "artifacts"))) {
    const relativePath = path.relative(root, filePath).split(path.sep).join(path.posix.sep);
    if (readyPdfPaths.has(relativePath)) continue;
    const fileStat = await stat(filePath);
    await rm(filePath, { force: true });
    orphanFiles++;
    orphanBytes += fileStat.size;
  }
  freedBytes += orphanBytes;

  const summary = {
    backupPath,
    candidates: candidates.length,
    reused,
    compressed,
    retainedOld,
    failed,
    orphanFilesDeleted: orphanFiles,
    freedGiB: Number((freedBytes / 1024 / 1024 / 1024).toFixed(3)),
  };
  console.log(JSON.stringify(summary, null, 2));
  db.close();
  if (failed > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
