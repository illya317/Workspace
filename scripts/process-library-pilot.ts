import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { LIBRARY_PIPELINE_VERSION } from "@workspace/library/constants";
import { getDefaultRoot } from "@workspace/library/server/config";
import { processLibraryVersion } from "@workspace/library/server/processing";
import { prisma } from "@workspace/platform/server/prisma";

type PilotRow = { pilotUid: string; sourcePath: string; sourceSha256: string };

const args = process.argv.slice(2);
function arg(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const pilotManifest = arg("--pilot-manifest");
  if (!pilotManifest) throw new Error("--pilot-manifest is required");
  const configuredLimit = Number(arg("--limit") || Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(configuredLimit) || configuredLimit <= 0) throw new Error("--limit must be a positive integer");
  const rows = (await readFile(pilotManifest, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PilotRow)
    .slice(0, configuredLimit);
  const results: Array<Record<string, unknown>> = [];
  const startedAt = new Date();

  for (const [index, row] of rows.entries()) {
    const document = await prisma.libraryDocument.findUnique({
      where: { stableKey: `default:${row.sourcePath}` },
      select: { currentVersion: { select: { versionUid: true, checksumSha256: true } } },
    });
    if (!document?.currentVersion) {
      results.push({ ...row, status: "failed", error: "current_version_missing" });
      console.log(`[${index + 1}/${rows.length}] failed ${row.sourcePath}: current version missing`);
      continue;
    }
    if (document.currentVersion.checksumSha256 !== row.sourceSha256) {
      results.push({ ...row, versionUid: document.currentVersion.versionUid, status: "failed", error: "pilot_checksum_mismatch" });
      console.log(`[${index + 1}/${rows.length}] failed ${row.sourcePath}: pilot checksum mismatch`);
      continue;
    }
    const itemStartedAt = Date.now();
    try {
      const result = await processLibraryVersion({ versionUid: document.currentVersion.versionUid });
      results.push({
        ...row,
        versionUid: document.currentVersion.versionUid,
        elapsedMs: Date.now() - itemStartedAt,
        ...result,
      });
      console.log(`[${index + 1}/${rows.length}] ${result.status} ${row.sourcePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        ...row,
        versionUid: document.currentVersion.versionUid,
        status: "failed",
        elapsedMs: Date.now() - itemStartedAt,
        error: message,
      });
      console.log(`[${index + 1}/${rows.length}] failed ${row.sourcePath}: ${message}`);
    }
  }

  const summary = {
    pipelineVersion: LIBRARY_PIPELINE_VERSION,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    total: results.length,
    succeeded: results.filter((item) => item.status === "succeeded").length,
    warnings: results.filter((item) => item.status === "warning").length,
    failed: results.filter((item) => item.status === "failed").length,
    reused: results.filter((item) => item.reused === true).length,
    results,
  };
  const reportDir = path.join(getDefaultRoot(), ".manifests", "processing");
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `pilot-${LIBRARY_PIPELINE_VERSION}-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ reportPath, ...summary, results: undefined }, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
