#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
}

async function writeJson(relativePath, data) {
  await fs.writeFile(path.join(root, relativePath), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Updated ${relativePath}`);
}

const countObservationPath = "config/pharma-ops/table_layouts/templates/microbiology/microbial_count_observation_results.json";
const countObservation = await readJson(countObservationPath);
countObservation.params = {
  ...(countObservation.params || {}),
  microbial_count_observation_suffix: countObservation.params?.microbial_count_observation_suffix || "2.4",
  microbial_count_observation_role: countObservation.params?.microbial_count_observation_role || "cultivation",
};
for (const include of countObservation.includes || []) {
  include.params = { ...(include.params || {}), section_ref: "{{microbial_count_observation_role}}" };
}
for (const block of countObservation.blocks || []) {
  if (block.type !== "title") continue;
  block.section_suffix = "{{microbial_count_observation_suffix}}";
  block.section_role = "{{microbial_count_observation_role}}";
}
await writeJson(countObservationPath, countObservation);

const ecoliObservationPath = "config/pharma-ops/table_layouts/templates/microbiology/escherichia_coli_observation.json";
const ecoliObservation = await readJson(ecoliObservationPath);
ecoliObservation.params = {
  ...(ecoliObservation.params || {}),
  ecoli_observation_suffix: ecoliObservation.params?.ecoli_observation_suffix || "1.7",
};
for (const block of ecoliObservation.blocks || []) {
  if (block.type === "title") block.section_suffix = "{{ecoli_observation_suffix}}";
}
await writeJson(ecoliObservationPath, ecoliObservation);

const ecoliProcedurePath = "config/pharma-ops/table_layouts/templates/microbiology/escherichia_coli_procedure.json";
const ecoliProcedure = await readJson(ecoliProcedurePath);
ecoliProcedure.params = {
  ...(ecoliProcedure.params || {}),
  ecoli_sample_suffix: ecoliProcedure.params?.ecoli_sample_suffix || "1.2",
  ecoli_positive_suffix: ecoliProcedure.params?.ecoli_positive_suffix || "1.3",
  ecoli_negative_suffix: ecoliProcedure.params?.ecoli_negative_suffix || "1.4",
  ecoli_cultivation_suffix: ecoliProcedure.params?.ecoli_cultivation_suffix || "1.5",
  ecoli_condition_suffix: ecoliProcedure.params?.ecoli_condition_suffix || "1.6",
};
if (!(ecoliProcedure.blocks || []).some((block) => block.template_id === "microbiology/escherichia_coli_filter_prep")) {
  ecoliProcedure.blocks.splice(1, 0, {
    type: "include",
    template_id: "microbiology/escherichia_coli_filter_prep",
    variant_param: "ecoli_filter_prep_variant",
    default_variant: "none",
    order: 151,
    variants: {
      none: { skip: true, title: "不包含试验准备" },
      include: { template_id: "microbiology/escherichia_coli_filter_prep", title: "大肠埃希菌试验准备" },
    },
  });
}
for (const block of ecoliProcedure.blocks || []) {
  for (const part of block.parts || []) {
    if (part.type === "section_heading" && part.text?.startsWith("供试品制备")) {
      part.section_suffix = "{{ecoli_sample_suffix}}";
    }
    if (part.type === "section_heading" && part.text?.startsWith("阳性对照")) {
      part.section_suffix = "{{ecoli_positive_suffix}}";
    }
    if (part.type === "section_heading" && part.text?.startsWith("阴性对照试验")) {
      part.section_suffix = "{{ecoli_negative_suffix}}";
    }
    if (part.type === "section_heading" && part.text?.startsWith("培养")) {
      part.section_suffix = "{{ecoli_cultivation_suffix}}";
    }
    if (part.type === "section_heading" && part.text?.startsWith("试验成立条件")) {
      part.section_suffix = "{{ecoli_condition_suffix}}";
    }
  }
}
await writeJson(ecoliProcedurePath, ecoliProcedure);

const ecoliFilterPrepPath = "config/pharma-ops/table_layouts/templates/microbiology/escherichia_coli_filter_prep.json";
await writeJson(ecoliFilterPrepPath, {
  schema_version: 2,
  template_id: "microbiology/escherichia_coli_filter_prep",
  title: "大肠埃希菌试验准备",
  section_no: "",
  category: "microbiology",
  subcomponent: true,
  status: "pilot",
  source_refs: [
    {
      product: "阿奇霉素胶囊/克拉霉素胶囊/盐酸左氧氟沙星胶囊",
      section_no: "微生物限度 大肠埃希菌 试验准备",
      md: "schema/md_canonical/*.md",
    },
  ],
  blocks: [
    {
      type: "paragraph",
      className: "layout-paragraph layout-operation-text",
      parts: [
        { type: "section_heading", section_suffix: "1.2", section_ref: "detection", text: "试验准备：", bold: true },
        { type: "text", text: "取" },
        {
          type: "line",
          field_key: "layout/microbiology/ecoli/filter_prewet_volume",
          input_type: "number",
          underline: true,
          initial_chars: 4,
          default: "20",
          placeholder: "20",
        },
        { type: "text", text: "ml" },
        { type: "param", name: "diluent_name", default: "pH7.0无菌氯化钠-蛋白胨缓冲液" },
        { type: "text", text: "，润湿滤膜2张。" },
      ],
      order: 151,
    },
  ],
  order: 151,
});

const mappingPath = "config/pharma-ops/table_layouts/layout_mapping.json";
const mapping = await readJson(mappingPath);
const assignments = mapping.assignments || {};
for (const key of [
  "products/azithromycin/finished/microbial_limit",
  "products/clarithromycin/finished/microbial_limit",
  "products/levofloxacin/finished/microbial_limit",
]) {
  const assignment = assignments[key];
  if (!assignment) continue;
  assignment.params = {
    ...(assignment.params || {}),
    microbial_count_process_variant: key.includes("levofloxacin") ? "membrane_filter_manganese" : "membrane_filter",
    ecoli_filter_prep_variant: "include",
    ecoli_sample_suffix: "1.3",
    ecoli_positive_suffix: "1.4",
    ecoli_negative_suffix: "1.5",
    ecoli_cultivation_suffix: "1.6",
    ecoli_condition_suffix: "1.7",
    ecoli_observation_suffix: "1.8",
    microbial_count_observation_suffix: "2.5",
    microbial_count_observation_role: "count_observation",
  };
  if (!assignment.params.diluent_name) assignment.params.diluent_name = "pH7.0无菌氯化钠-蛋白胨缓冲液";
  if (key.includes("levofloxacin") && !assignment.params.manganese_solution_name) {
    assignment.params.manganese_solution_name = "0.1%硫酸锰溶液";
  }
}
await writeJson(mappingPath, mapping);
