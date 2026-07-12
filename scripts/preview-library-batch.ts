import { previewLibraryVersion } from "@workspace/library/server/preview";
import { prisma } from "@workspace/platform/server/prisma";

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const limit = value("--limit") ? Number(value("--limit")) : 10;
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("--limit must be 1..500");

async function main() {
  const versions = await prisma.libraryDocumentVersion.findMany({
    where: {
      currentForDocument: { is: { status: "active", ...(value("--category") ? { categoryName: value("--category") } : {}) } },
      extension: { in: ["pdf", "PDF"] },
      artifacts: { none: { kind: "preview-pdf", status: "ready" } },
      processingJobs: { none: { kind: "preview", errorCode: "unsupported_type" } },
    },
    take: limit,
    orderBy: { document: { docId: "asc" } },
    select: { versionUid: true, document: { select: { docId: true, title: true, fileName: true } } },
  });
  const results = [];
  for (const [index, version] of versions.entries()) {
    try {
      const result = await previewLibraryVersion({ versionUid: version.versionUid });
      results.push({ versionUid: version.versionUid, docId: version.document.docId, status: result.status, reused: result.reused });
    } catch (error) {
      results.push({ versionUid: version.versionUid, docId: version.document.docId, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
    console.error(`[library-preview] ${index + 1}/${versions.length} ${version.document.title || version.document.fileName}`);
  }
  const remaining = await prisma.libraryDocument.count({
    where: {
      status: "active",
      currentVersion: { is: {
        extension: { in: ["pdf", "PDF"] },
        artifacts: { none: { kind: "preview-pdf", status: "ready" } },
        processingJobs: { none: { kind: "preview", errorCode: "unsupported_type" } },
      } },
    },
  });
  const unsupported = await prisma.libraryDocument.count({
    where: { status: "active", currentVersion: { is: { processingJobs: { some: { kind: "preview", errorCode: "unsupported_type" } } } } },
  });
  console.log(JSON.stringify({ attempted: results.length, succeeded: results.filter((item) => item.status === "succeeded").length, failed: results.filter((item) => item.status === "failed").length, remaining, unsupported, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
