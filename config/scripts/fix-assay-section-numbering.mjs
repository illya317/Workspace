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
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function parameterizeTitleSuffix(relPath, paramName, defaultValue) {
  const file = path.join(templatesRoot, relPath);
  const data = await readJson(file);
  data.params = { [paramName]: defaultValue, ...(data.params || {}) };
  data.blocks = (data.blocks || []).map((block) => (
    block.type === "title" && block.section_ref === "operation"
      ? { ...block, section_suffix: `{${paramName}}` }
      : block
  ));
  await writeJson(file, data);
}

for (const relPath of [
  "weighing/hplc_reference_sample_theoretical.json",
  "weighing/hplc_reference_sample_20_tablets.json",
  "weighing/uv_absorbance_sample_theoretical.json",
  "weighing/uv_absorbance_sample_20_tablets.json",
]) {
  await parameterizeTitleSuffix(relPath, "hplc_weighing_section_suffix", "1");
}

for (const relPath of [
  "measurement/hplc_reference_sample_calculation.json",
  "measurement/uv_absorbance_calculation.json",
]) {
  await parameterizeTitleSuffix(relPath, "hplc_measurement_section_suffix", "2");
}

const mapping = await readJson(mappingPath);
const assignments = mapping.assignments || {};

for (const key of [
  "products/berberine_tannate/intermediate/content",
  "products/berberine_tannate/packaging/content",
  "products/compound_rutin/intermediate/content",
  "products/compound_rutin/packaging/content",
]) {
  assignments[key].params ||= {};
  assignments[key].params.hplc_weighing_section_suffix = "1.1";
  assignments[key].params.hplc_measurement_section_suffix = "1.2";
}

for (const key of [
  "products/levofloxacin/packaging/content",
  "products/terazosin/intermediate/content",
]) {
  assignments[key].params ||= {};
  assignments[key].params.hplc_measurement_heading_variant = "show";
}

await writeJson(mappingPath, mapping);
console.log("Updated assay section numbering parameters.");
