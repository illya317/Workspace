#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const templatesRoot = path.join(root, "config/pharma-ops/table_layouts/templates");

async function readJson(relPath) {
  return JSON.parse(await fs.readFile(path.join(templatesRoot, relPath), "utf8"));
}

async function writeJson(relPath, data) {
  await fs.mkdir(path.dirname(path.join(templatesRoot, relPath)), { recursive: true });
  await fs.writeFile(path.join(templatesRoot, relPath), `${JSON.stringify(data, null, 2)}\n`);
}

function withoutTitleBlock(data, templateId, title) {
  return {
    ...data,
    template_id: templateId,
    title,
    blocks: (data.blocks || []).filter((block) => block.type !== "title"),
  };
}

const hplc = await readJson("measurement/hplc_reference_sample_calculation.json");
const uv = await readJson("measurement/uv_absorbance_calculation.json");
const uniformity = await readJson("calculation/content_uniformity_10_sample.json");

await writeJson(
  "measurement/hplc_reference_sample_calculation_inline.json",
  withoutTitleBlock(hplc, "measurement/hplc_reference_sample_calculation_inline", "HPLC 含量测定与计算（内嵌无标题）"),
);
await writeJson(
  "measurement/uv_absorbance_calculation_inline.json",
  withoutTitleBlock(uv, "measurement/uv_absorbance_calculation_inline", "UV 含量测定与计算（内嵌无标题）"),
);
await writeJson(
  "calculation/content_uniformity_10_sample_inline.json",
  withoutTitleBlock(uniformity, "calculation/content_uniformity_10_sample_inline", "含量均匀度 10 片计算（内嵌无标题）"),
);

const hplcOperation = await readJson("operation/hplc_content_operation.json");
hplcOperation.includes = hplcOperation.includes.map((entry) => {
  if (entry.variant_param !== "hplc_measurement_heading_variant") return entry;
  return {
    ...entry,
    variants: {
      ...entry.variants,
      inline: {
        template_id: "measurement/hplc_reference_sample_calculation_inline",
        title: "测定与计算（内嵌无标题）",
      },
      uv_absorbance_inline: {
        template_id: "measurement/uv_absorbance_calculation_inline",
        title: "UV含量测定与计算（内嵌无标题）",
      },
    },
  };
});
await writeJson("operation/hplc_content_operation.json", hplcOperation);

const dissolutionOperation = await readJson("operation/dissolution_operation.json");
dissolutionOperation.includes = dissolutionOperation.includes.map((entry) => {
  if (entry.variant_param !== "dissolution_method_variant") return entry;
  return {
    ...entry,
    variants: {
      ...entry.variants,
      hplc_inline: {
        template_id: "measurement/hplc_reference_sample_calculation_inline",
        title: "HPLC测定（内嵌无标题）",
      },
    },
  };
});
await writeJson("operation/dissolution_operation.json", dissolutionOperation);

const uniformityOperation = await readJson("operation/content_uniformity_hplc_operation.json");
uniformityOperation.includes = uniformityOperation.includes.map((entry) => {
  if (entry.variant_param !== "content_uniformity_calculation_heading_variant") return entry;
  return {
    ...entry,
    variants: {
      ...entry.variants,
      inline: {
        template_id: "calculation/content_uniformity_10_sample_inline",
        title: "测定与计算（内嵌无标题）",
      },
    },
  };
});
await writeJson("operation/content_uniformity_hplc_operation.json", uniformityOperation);

console.log("Generated inline no-heading calculation templates and wired inline variants.");
