#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const file = path.join(root, "config/pharma-ops/table_layouts/templates/operation/pre_method_microbiology_limit.json");

const data = JSON.parse(await fs.readFile(file, "utf8"));

for (const block of data.blocks || []) {
  if (block.type !== "include") continue;
  if (block.template_id === "common/environment_table") {
    block.params = { ...(block.params || {}), section_suffix: "2", order: 110 };
  }
  if (block.template_id === "microbiology/equipment_limit_test") {
    block.params = { ...(block.params || {}), section_suffix: "3", order: 120 };
  }
}

await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Updated ${path.relative(root, file)}`);
