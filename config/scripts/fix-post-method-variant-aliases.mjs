#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const postMethodPath = path.join(root, "config/pharma-ops/table_layouts/templates/common/post_method.json");
const data = JSON.parse(await fs.readFile(postMethodPath, "utf8"));

data.includes = (data.includes || []).map((entry) => {
  if (entry.variant_param !== "post_conclusion_variant") return entry;
  return {
    ...entry,
    variant_param_aliases: [
      "hplc_conclusion_variant",
      "related_conclusion_variant",
      "dissolution_conclusion_variant",
      "content_uniformity_conclusion_variant",
      "identification_conclusion_variant",
      "variation_conclusion_variant",
    ],
  };
});

await fs.writeFile(postMethodPath, `${JSON.stringify(data, null, 2)}\n`);
console.log("Added post_method conclusion variant aliases.");
