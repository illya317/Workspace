import { readFile } from "node:fs/promises";

import { importLibraryCatalog } from "@workspace/library/import";
import { prisma } from "@workspace/platform/server/prisma";

const args = process.argv.slice(2);
function required(name: string) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const catalogPath = required("--catalog");
  const taxonomyPath = required("--taxonomy");
  const records = (await readFile(catalogPath, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const taxonomy = JSON.parse(await readFile(taxonomyPath, "utf8"));
  console.log(JSON.stringify(await importLibraryCatalog({ records, taxonomy }), null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
