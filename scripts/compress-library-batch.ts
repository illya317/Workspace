import { previewLibraryVersion } from "@workspace/library/server/preview";
import { LIBRARY_PREVIEW_VERSION } from "@workspace/library/constants";
import { prisma } from "@workspace/platform/server/prisma";

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const limit = value("--limit") ? Number(value("--limit")) : 1;
const minMiB = value("--min-mib") ? Number(value("--min-mib")) : 10;
const order = args.includes("--smallest-first") ? "asc" as const : "desc" as const;
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be 1..100");
if (!Number.isFinite(minMiB) || minMiB < 0) throw new Error("--min-mib must be non-negative");

async function main() {
  const versions = await prisma.libraryDocumentVersion.findMany({
    where: {
      currentForDocument: { is: { status: "active" } },
      extension: { in: ["pdf", "PDF"] },
      fileSizeBytes: { gte: Math.round(minMiB * 1024 * 1024) },
      processingJobs: { none: { kind: "preview", pipelineVersion: LIBRARY_PREVIEW_VERSION, status: { in: ["succeeded", "warning"] } } },
    },
    take: limit,
    orderBy: { fileSizeBytes: order },
    select: { versionUid: true, fileSizeBytes: true, document: { select: { docId: true, title: true, fileName: true } } },
  });
  const results = [];
  for (const [index, version] of versions.entries()) {
    try {
      const result = await previewLibraryVersion({ versionUid: version.versionUid });
      results.push({
        versionUid: version.versionUid,
        docId: version.document.docId,
        fileSizeBytes: version.fileSizeBytes,
        status: result.status,
        compressionRetained: "compressionRetained" in result ? result.compressionRetained : null,
        compressionSavingsRatio: "compressionSavingsRatio" in result ? result.compressionSavingsRatio : null,
      });
    } catch (error) {
      results.push({ versionUid: version.versionUid, docId: version.document.docId, fileSizeBytes: version.fileSizeBytes, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
    console.error(`[library-compress] ${index + 1}/${versions.length} ${version.document.title || version.document.fileName}`);
  }
  console.log(JSON.stringify({ attempted: results.length, retained: results.filter((item) => "compressionRetained" in item && item.compressionRetained === true).length, failed: results.filter((item) => item.status === "failed").length, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
