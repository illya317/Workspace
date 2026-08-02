import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { prepareLibraryPilotArtifacts } from "@workspace/library/server/pilot-preparation";

const args = process.argv.slice(2);
const valueAfter = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const indexDir = valueAfter("--index-dir")?.trim();
const checkOnly = args.includes("--check");

if (!indexDir) {
  throw new Error("Usage: node --import tsx scripts/prepare-library-pilot.ts --index-dir <资料库索引> [--check]");
}

const repoRoot = process.cwd();
const taxonomyPath = path.join(repoRoot, "prisma/seed-data/library-taxonomy.v1.json");
const catalogPath = path.join(indexDir, "catalog.jsonl");
const outputDir = path.join(indexDir, "phase0");

async function main() {
  const [catalogJsonl, taxonomyText] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(taxonomyPath, "utf8"),
  ]);
  const prepared = prepareLibraryPilotArtifacts({
    catalogJsonl,
    taxonomy: JSON.parse(taxonomyText),
  });

  if (checkOnly) {
    const existingSummary = JSON.parse(await readFile(path.join(outputDir, "gate0-summary.json"), "utf8"));
    if (JSON.stringify(existingSummary) !== JSON.stringify(prepared.summary)) {
      throw new Error("Phase 0 outputs are stale; rerun without --check");
    }
    console.log(JSON.stringify(prepared.summary, null, 2));
    return;
  }

  await mkdir(outputDir, { recursive: true });
  await Promise.all(Object.entries(prepared.files).map(([fileName, content]) => (
    writeFile(path.join(outputDir, fileName), content)
  )));
  console.log(JSON.stringify(prepared.summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
