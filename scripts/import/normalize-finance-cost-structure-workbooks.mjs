#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { normalizeCostStructureWorkbook } from "./finance-cost-structure-workbook.mjs";

const args = process.argv.slice(2);
const outDirIndex = args.indexOf("--out-dir");
if (outDirIndex < 0 || !args[outDirIndex + 1]) {
  throw new Error("Usage: normalize-finance-cost-structure-workbooks.mjs --out-dir <dir> <workbook.xls> [...]");
}

const outDir = path.resolve(args[outDirIndex + 1]);
const inputFiles = args.filter((_, index) => index !== outDirIndex && index !== outDirIndex + 1);
if (inputFiles.length === 0) throw new Error("At least one workbook path is required");

await fs.mkdir(outDir, { recursive: true });

for (const inputFile of inputFiles) {
  const normalized = normalizeCostStructureWorkbook(path.resolve(inputFile));
  if (!normalized.year) throw new Error(`No monthly sheets found in ${inputFile}`);

  const outputPath = path.join(outDir, `${normalized.year}.json`);
  const temporaryPath = `${outputPath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`);
  await fs.rename(temporaryPath, outputPath);
  console.log(`${normalized.sourceFile}: ${normalized.standardRows.length} rows -> ${outputPath}`);
}
