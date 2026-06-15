#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const filePath = path.join(root, "config/pharma-ops/methods/impurity.yaml");
const text = await fs.readFile(filePath, "utf8");

const before = "  有关物质:\n    extends: HPLC\n    extra:\n";
const after = "  有关物质:\n    extra:\n";

if (!text.includes(before)) {
  console.log("No change: 有关物质 no longer extends HPLC.");
  process.exit(0);
}

await fs.writeFile(filePath, text.replace(before, after));
console.log("Updated methods/impurity.yaml: removed erroneous HPLC inheritance from 有关物质.");
