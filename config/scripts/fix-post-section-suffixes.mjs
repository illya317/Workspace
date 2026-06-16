#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const configRoot = path.join(root, "config/pharma-ops");
const postPath = path.join(configRoot, "table_layouts/templates/common/post_method.json");
const mappingPath = path.join(configRoot, "table_layouts/layout_mapping.json");

const data = JSON.parse(await fs.readFile(postPath, "utf8"));
data.params = {
  post_standard_variant: "include",
  post_abnormal_variant: "include",
  post_cleanup_variant: "include",
  post_cleanroom_exit_variant: "none",
  post_conclusion_variant: "include",
  post_standard_section_suffix: "auto",
  post_abnormal_section_suffix: "auto",
  post_cleanup_section_suffix: "auto",
  post_cleanroom_exit_section_suffix: "auto",
  post_conclusion_section_suffix: "auto",
  post_attachment_section_suffix: "auto",
  ...(data.params || {}),
};

const suffixByVariant = {
  post_standard_variant: "post_standard_section_suffix",
  post_abnormal_variant: "post_abnormal_section_suffix",
  post_cleanup_variant: "post_cleanup_section_suffix",
  post_cleanroom_exit_variant: "post_cleanroom_exit_section_suffix",
  post_conclusion_variant: "post_conclusion_section_suffix",
  post_attachment_variant: "post_attachment_section_suffix",
};

data.includes = (data.includes || []).map((entry) => {
  const key = suffixByVariant[entry.variant_param];
  if (!key) return entry;
  return {
    ...entry,
    params: {
      ...(entry.params || {}),
      section_suffix: `{${key}}`,
    },
  };
});
await fs.writeFile(postPath, `${JSON.stringify(data, null, 2)}\n`);

const mapping = JSON.parse(await fs.readFile(mappingPath, "utf8"));
const assignments = mapping.assignments || {};
const set = (key, params) => {
  assignments[key].params ||= {};
  Object.assign(assignments[key].params, params);
};

set("products/atenolol/finished/identification", { identification_attachment_variant: "raw" });
set("products/azithromycin/finished/identification", { identification_attachment_variant: "raw" });
set("products/allopurinol/packaging/content", { pre_method_reference_variant: "include" });
set("products/diammonium_glycyrrhizinate/packaging/content", {
  post_standard_variant: "none",
  post_abnormal_section_suffix: "7",
  post_cleanup_section_suffix: "8",
  post_conclusion_section_suffix: "9",
});
set("products/methimazole/intermediate/content", {
  post_standard_section_suffix: "6",
  post_abnormal_section_suffix: "7",
  post_cleanup_section_suffix: "8",
  post_conclusion_section_suffix: "9",
});
set("products/methimazole/packaging/content", {
  post_standard_section_suffix: "6",
  post_abnormal_section_suffix: "7",
  post_cleanup_section_suffix: "8",
  post_conclusion_section_suffix: "9",
});
set("products/diammonium_glycyrrhizinate/finished/weight_variation", {
  post_standard_section_suffix: "6",
  post_abnormal_section_suffix: "7",
  post_cleanup_section_suffix: "8",
  post_conclusion_section_suffix: "9",
});
set("products/spironolactone/packaging/dissolution", {
  post_conclusion_section_suffix: "9",
  post_attachment_section_suffix: "10",
});

await fs.writeFile(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`);
console.log("Parameterized post section suffixes and patched remaining post-section mappings.");
