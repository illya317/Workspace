#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const file = path.join(root, "config/pharma-ops/table_layouts/templates/operation/content_uniformity_hplc_operation.json");
const data = JSON.parse(await fs.readFile(file, "utf8"));

data.includes = (data.includes || []).map((entry) => {
  if (entry.variant_param !== "content_uniformity_calculation_heading_variant") return entry;
  const params = entry.params || {};
  const variants = { ...(entry.variants || {}) };
  variants.show = {
    ...variants.show,
    params: {
      ...params,
      ...(variants.show?.params || {}),
    },
  };
  return {
    ...entry,
    params: undefined,
    variants,
  };
});

await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
console.log("Moved content uniformity calculation section params from include to show variant.");
