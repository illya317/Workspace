#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const configRoot = path.join(root, "config/pharma-ops");
const templatesRoot = path.join(configRoot, "table_layouts/templates");
const mappingPath = path.join(configRoot, "table_layouts/layout_mapping.json");

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

const peak = await readJson(path.join(templatesRoot, "calculation/hplc_related_substances_peak_area_calculation.json"));
await writeJson(path.join(templatesRoot, "calculation/hplc_related_substances_peak_area_calculation_inline.json"), {
  ...peak,
  template_id: "calculation/hplc_related_substances_peak_area_calculation_inline",
  title: "HPLC 有关物质峰面积计算（内嵌无标题）",
  blocks: (peak.blocks || []).filter((block) => block.type !== "title"),
});

const relatedOperationPath = path.join(templatesRoot, "operation/related_substances_hplc_operation.json");
const relatedOperation = await readJson(relatedOperationPath);
relatedOperation.blocks = (relatedOperation.blocks || []).map((block) => {
  if (block.variant_param !== "related_peak_calculation_variant") return block;
  return {
    ...block,
    variants: {
      ...block.variants,
      hplc_0512_peak_area_inline: {
        template_id: "calculation/hplc_related_substances_peak_area_calculation_inline",
        title: "HPLC 有关物质峰面积计算（内嵌无标题）",
      },
    },
  };
});
await writeJson(relatedOperationPath, relatedOperation);

const mapping = await readJson(mappingPath);
const assignments = mapping.assignments || {};

for (const key of [
  "products/azithromycin/finished/content",
]) {
  assignments[key].params ||= {};
  assignments[key].params.hplc_measurement_heading_variant = "inline";
}

for (const key of [
  "products/hydrochlorothiazide/finished/content_uniformity",
  "products/isosorbide_dinitrate/finished/content_uniformity",
  "products/methimazole/finished/content_uniformity",
  "products/simvastatin/finished/content_uniformity",
  "products/spironolactone/finished/content_uniformity",
  "products/terazosin/packaging/content_uniformity",
  "products/terazosin/finished/content_uniformity",
]) {
  assignments[key].params ||= {};
  assignments[key].params.content_uniformity_calculation_heading_variant = "inline";
}

assignments["products/simvastatin/finished/related_substances"].params ||= {};
assignments["products/simvastatin/finished/related_substances"].params.related_peak_calculation_variant = "hplc_0512_peak_area_inline";

await writeJson(mappingPath, mapping);
console.log("Converted render-only calculation headings to inline variants.");
