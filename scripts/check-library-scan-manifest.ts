import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import { computeChecksumOrThrow } from "@workspace/library/server/checksum";
import { getDefaultRoot, getDefaultSourceRoot, safeResolve } from "@workspace/library/server/config";
import { prisma } from "@workspace/platform/server/prisma";

type SourceManifestRow = { path: string; sha256: string; size: number };
type ScanManifestEntry = {
  relativePath: string;
  sizeBytes: number;
  checksumSha256: string | null;
  status: string;
  documentUid?: string;
  versionUid?: string;
};
type ScanManifest = {
  manifestUid: string;
  eligibleFileCount: number;
  directoryErrorCount: number;
  entries: ScanManifestEntry[];
};

const args = process.argv.slice(2);
function requiredArg(name: string) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseJsonl<T>(text: string): T[] {
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function verifyFile(absolutePath: string, expectedSize: number, expectedChecksum: string, label: string) {
  const fileStat = await stat(absolutePath);
  assert(fileStat.isFile(), `${label} is not a regular file`);
  assert(fileStat.size === expectedSize, `${label} size mismatch`);
  assert(await computeChecksumOrThrow(absolutePath) === expectedChecksum, `${label} SHA256 mismatch`);
}

async function main() {
  const manifestPath = requiredArg("--manifest");
  const sourceManifestPath = requiredArg("--source-manifest");
  const sourceRoot = getDefaultSourceRoot();
  const runtimeRoot = getDefaultRoot();
  assert(sourceRoot && runtimeRoot && sourceRoot !== runtimeRoot, "source/runtime roots must be configured and different");

  const [manifestContent, sourceManifestContent] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(sourceManifestPath, "utf8"),
  ]);
  const manifest = JSON.parse(manifestContent) as ScanManifest;
  const sourceRows = parseJsonl<SourceManifestRow>(sourceManifestContent);
  const sourceByPath = new Map(sourceRows.map((row) => [row.path, row]));
  assert(sourceByPath.size === sourceRows.length, "source manifest contains duplicate paths");
  assert(manifest.directoryErrorCount === 0, "scan manifest contains directory errors");
  assert(manifest.entries.length === manifest.eligibleFileCount, "scan manifest entry count mismatch");
  assert(manifest.entries.length === sourceRows.length, "scan/source manifest coverage mismatch");
  assert(!manifest.entries.some((entry) => entry.status === "failed"), "scan manifest contains failed files");

  const documentUids = manifest.entries.map((entry) => entry.documentUid).filter((value): value is string => Boolean(value));
  assert(documentUids.length === manifest.entries.length, "every manifest entry requires documentUid");
  const documents = await prisma.libraryDocument.findMany({
    where: { documentUid: { in: documentUids } },
    select: {
      documentUid: true,
      currentVersion: {
        select: { versionUid: true, storagePath: true, fileSizeBytes: true, checksumSha256: true },
      },
    },
  });
  const documentByUid = new Map(documents.map((document) => [document.documentUid, document]));
  assert(documentByUid.size === manifest.entries.length, "manifest documents are not one-to-one in DB");

  for (const entry of manifest.entries) {
    const expected = sourceByPath.get(entry.relativePath);
    assert(expected, `source manifest missing ${entry.relativePath}`);
    assert(entry.sizeBytes === expected.size, `manifest size mismatch: ${entry.relativePath}`);
    assert(entry.checksumSha256 === expected.sha256, `manifest SHA256 mismatch: ${entry.relativePath}`);
    assert(entry.documentUid && entry.versionUid && entry.checksumSha256, `manifest identity incomplete: ${entry.relativePath}`);
    const document = documentByUid.get(entry.documentUid);
    assert(document?.currentVersion, `DB current version missing: ${entry.relativePath}`);
    assert(document.currentVersion.versionUid === entry.versionUid, `DB version UID mismatch: ${entry.relativePath}`);
    assert(document.currentVersion.fileSizeBytes === entry.sizeBytes, `DB version size mismatch: ${entry.relativePath}`);
    assert(document.currentVersion.checksumSha256 === entry.checksumSha256, `DB version SHA256 mismatch: ${entry.relativePath}`);
    const sourcePath = safeResolve(entry.relativePath, sourceRoot);
    const runtimePath = safeResolve(document.currentVersion.storagePath, runtimeRoot);
    assert(sourcePath && runtimePath, `unsafe source/runtime path: ${entry.relativePath}`);
    await verifyFile(sourcePath, entry.sizeBytes, entry.checksumSha256, `source ${entry.relativePath}`);
    await verifyFile(runtimePath, entry.sizeBytes, entry.checksumSha256, `runtime ${entry.relativePath}`);
  }

  const manifestChecksumSha256 = createHash("sha256").update(manifestContent).digest("hex");
  console.log(JSON.stringify({
    verdict: "PASS",
    manifestUid: manifest.manifestUid,
    manifestChecksumSha256,
    files: manifest.entries.length,
    duplicates: manifest.entries.filter((entry) => "duplicateOfVersionUid" in entry).length,
  }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await prisma.$disconnect();
  process.exit(1);
});
