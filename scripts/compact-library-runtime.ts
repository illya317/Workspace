import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDefaultRoot } from "@workspace/library/server/config";
import { previewLibraryVersion, supportsLibraryPreview } from "@workspace/library/server/preview";
import { processLibraryVersion } from "@workspace/library/server/processing";
import {
  promoteLibraryVersionToCompactRuntime,
  retainLibraryVersionOriginal,
} from "@workspace/library/server/version-content";
import { prisma } from "@workspace/platform/server/prisma";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

function value(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const limit = Number(value("--limit") || "0");
const concurrency = Number(value("--concurrency") || "1");
if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
  throw new Error("--concurrency must be 1..3");
}

type CompactCandidate = {
  id: number;
  versionUid: string;
  extension: string | null;
  document: { id: number; docId: string; fileName: string };
  artifacts: Array<{ kind: string }>;
};

async function runPool<T>(items: T[], handler: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await handler(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function coverage(versionId: number) {
  const artifacts = await prisma.libraryArtifact.findMany({
    where: { versionId, status: "ready", kind: { in: ["preview-pdf", "markdown"] } },
    select: { kind: true },
  });
  const kinds = new Set(artifacts.map((artifact) => artifact.kind));
  return { preview: kinds.has("preview-pdf"), markdown: kinds.has("markdown") };
}

async function main() {
  const all = await prisma.libraryDocumentVersion.findMany({
    where: { currentForDocument: { is: { status: "active" } } },
    orderBy: { document: { docId: "asc" } },
    select: {
      id: true,
      versionUid: true,
      extension: true,
      document: { select: { id: true, docId: true, fileName: true } },
      artifacts: {
        where: { status: "ready", kind: { in: ["preview-pdf", "markdown"] } },
        select: { kind: true },
      },
    },
  }) as CompactCandidate[];
  const candidates = limit > 0 ? all.slice(0, limit) : all;
  const initial = candidates.map((version) => {
    const kinds = new Set(version.artifacts.map((artifact) => artifact.kind));
    return {
      version,
      preview: kinds.has("preview-pdf"),
      markdown: kinds.has("markdown"),
      previewable: supportsLibraryPreview(version.extension),
    };
  });
  const summary = {
    mode: execute ? "execute" : "dry-run",
    total: candidates.length,
    readyToPromote: initial.filter((item) => item.preview && item.markdown).length,
    markdownPending: initial.filter((item) => item.previewable && !item.markdown).length,
    previewPending: initial.filter((item) => item.previewable && !item.preview).length,
    retainedUnsupported: initial.filter((item) => !item.previewable).length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!execute) return;

  const results: Array<Record<string, unknown>> = [];
  await runPool(initial, async (item, index) => {
    const startedAt = Date.now();
    try {
      if (!item.previewable) {
        const retained = await retainLibraryVersionOriginal(item.version.id);
        results.push({
          documentId: item.version.document.id,
          docId: item.version.document.docId,
          status: "retained-unsupported",
          storagePath: retained.storagePath,
          elapsedMs: Date.now() - startedAt,
        });
      } else {
        if (!item.preview) await previewLibraryVersion({ versionUid: item.version.versionUid });
        if (!item.markdown) await processLibraryVersion({ versionUid: item.version.versionUid });
        const current = await coverage(item.version.id);
        const promoted = current.preview && current.markdown
          ? await promoteLibraryVersionToCompactRuntime(item.version.id)
          : { promoted: false, reason: "preview_and_markdown_required" as const };
        results.push({
          documentId: item.version.document.id,
          docId: item.version.document.docId,
          status: promoted.promoted ? "compacted" : "incomplete",
          ...promoted,
          elapsedMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      results.push({
        documentId: item.version.document.id,
        docId: item.version.document.docId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt,
      });
    }
    const result = results[results.length - 1];
    console.error(`[library-compact] ${index + 1}/${initial.length} ${result.status} ${item.version.document.fileName}`);
  });

  const report = {
    ...summary,
    finishedAt: new Date().toISOString(),
    compacted: results.filter((item) => item.status === "compacted").length,
    retained: results.filter((item) => item.status === "retained-unsupported").length,
    incomplete: results.filter((item) => item.status === "incomplete").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
  const reportDir = path.join(getDefaultRoot(), ".manifests", "compaction");
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `compact-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ reportPath, ...report, results: undefined }, null, 2));
  if (report.failed > 0 || report.incomplete > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
