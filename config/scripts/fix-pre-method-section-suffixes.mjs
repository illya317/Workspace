#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const configRoot = path.join(root, "config/pharma-ops");

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, data) {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

const preMethodPath = path.join(configRoot, "table_layouts/templates/operation/pre_method_standard.json");
const mappingPath = path.join(configRoot, "table_layouts/layout_mapping.json");

const preMethod = await readJson(preMethodPath);
preMethod.params = {
  ...preMethod.params,
  pre_method_environment_section_suffix: "1",
  pre_method_equipment_section_suffix: "2",
  pre_method_materials_section_suffix: "3",
  pre_method_reference_section_suffix: "4",
};

const suffixByTemplate = new Map([
  ["common/environment_table", "{pre_method_environment_section_suffix}"],
  ["common/equipment_table", "{pre_method_equipment_section_suffix}"],
  ["common/materials_table", "{pre_method_materials_section_suffix}"],
  ["common/reference_standard_table", "{pre_method_reference_section_suffix}"],
]);

for (const include of preMethod.includes || []) {
  const suffix = suffixByTemplate.get(include.template_id);
  if (!suffix) continue;
  include.params = { ...(include.params || {}), section_suffix: suffix };
}

const mapping = await readJson(mappingPath);
for (const assignment of Object.values(mapping.assignments || {})) {
  const params = assignment?.params;
  if (!params || typeof params !== "object") continue;
  if (params.pre_method_reference_variant === "include" && params.pre_method_materials_variant === "none") {
    params.pre_method_reference_section_suffix = "3";
  }
}

await writeJson(preMethodPath, preMethod);
await writeJson(mappingPath, mapping);

console.log("Parameterized pre-method section suffixes and aligned reference standards without materials to section 3.");
