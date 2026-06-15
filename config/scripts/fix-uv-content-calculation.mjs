#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const configRoot = path.join(root, "config/pharma-ops");
const templatePath = path.join(configRoot, "table_layouts/templates/measurement/uv_absorbance_calculation.json");
const operationPath = path.join(configRoot, "table_layouts/templates/operation/hplc_content_operation.json");
const mappingPath = path.join(configRoot, "table_layouts/layout_mapping.json");
const uvTheoreticalPath = path.join(configRoot, "table_layouts/templates/weighing/uv_absorbance_sample_theoretical.json");
const uvTwentyTabletsPath = path.join(configRoot, "table_layouts/templates/weighing/uv_absorbance_sample_20_tablets.json");
const uvMethodPath = path.join(configRoot, "methods/uv.yaml");

const field = (name, readonly = false) => ({ type: "field", field: name, readonly_display: readonly });
const cell = (parts) => ({ parts });
const text = (value) => ({ text: value });

const uvTemplate = {
  schema_version: 2,
  template_id: "measurement/uv_absorbance_calculation",
  title: "UV 含量测定与计算",
  category: "measurement",
  subcomponent: true,
  status: "pilot",
  blocks: [
    { type: "title", text: "测定与计算", order: 150, section_ref: "operation", section_suffix: "2" },
    {
      type: "table",
      label: "UV含量测定与计算",
      order: 151,
      rows: [
        { cells: [text("规格/参数"), cell([field("规格"), { type: "text", text: " mg" }]), text("空白OD"), cell([field("空白OD")])] },
        { cells: [text("样品空白OD"), cell([field("样品空白OD")]), text("空白溶剂OD"), cell([field("空白溶剂OD")])] },
        { cells: [text("对照1-OD"), cell([field("对照1-OD")]), text("对照1-OD/mg"), cell([field("对照1-OD/mg", true)])] },
        { cells: [text("对照2-OD"), cell([field("对照2-OD")]), text("对照2-OD/mg"), cell([field("对照2-OD/mg", true)])] },
        { cells: [text("平均-OD/mg"), cell([field("平均-OD/mg", true)]), text("对照RD"), cell([field("对照RD", true), { type: "text", text: "%" }])] },
        { cells: [text("样1-OD"), cell([field("样1-OD")]), text("样1-含量"), cell([field("样1-含量", true), { type: "text", text: "%" }])] },
        { cells: [text("样2-OD"), cell([field("样2-OD")]), text("样2-含量"), cell([field("样2-含量", true), { type: "text", text: "%" }])] },
        { cells: [text("平均含量"), cell([field("平均含量", true), { type: "text", text: "%" }]), text("RD"), cell([field("RD", true), { type: "text", text: "%" }])] },
      ],
    },
  ],
  source_refs: [{ product: "all", section_no: "UV含量测定与计算", md: "schema/md_canonical/*.md" }],
  order: 151,
};

await fs.writeFile(templatePath, `${JSON.stringify(uvTemplate, null, 2)}\n`);

const operation = JSON.parse(await fs.readFile(operationPath, "utf8"));
const measurementInclude = operation.includes.find((item) => item.variant_param === "hplc_measurement_heading_variant");
measurementInclude.variants.uv_absorbance = {
  template_id: "measurement/uv_absorbance_calculation",
  title: "UV含量测定与计算",
};
await fs.writeFile(operationPath, `${JSON.stringify(operation, null, 2)}\n`);

const mapping = JSON.parse(await fs.readFile(mappingPath, "utf8"));
let changed = 0;
for (const assignment of Object.values(mapping.assignments)) {
  const params = assignment.params || {};
  if (params.hplc_operation_method_variant === "uv_content_0401") {
    params.hplc_measurement_heading_variant = "uv_absorbance";
    changed += 1;
  }
}
await fs.writeFile(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`);

const uvTheoretical = JSON.parse(await fs.readFile(uvTheoreticalPath, "utf8"));
const formulaParts = uvTheoretical.blocks?.[1]?.rows?.[0]?.cells?.[2]?.parts;
if (Array.isArray(formulaParts) && !JSON.stringify(formulaParts).includes('"field":"投料量"')) {
  formulaParts.splice(1, 0,
    { type: "field", field: "投料量", width: "4em" },
    { type: "text", text: " / [" },
    { type: "field", field: "批量", width: "4em" },
    { type: "text", text: " ×10] = " },
  );
}
await fs.writeFile(uvTheoreticalPath, `${JSON.stringify(uvTheoretical, null, 2)}\n`);

const uvTwentyTablets = JSON.parse(await fs.readFile(uvTwentyTabletsPath, "utf8"));
const twentyParts = uvTwentyTablets.blocks?.[1]?.rows?.[0]?.cells?.[2]?.parts;
if (Array.isArray(twentyParts) && !JSON.stringify(twentyParts).includes('"field":"20片总净重"')) {
  const insertAt = twentyParts.findIndex((part) => part.field === "平均片重");
  if (insertAt >= 0) {
    const previousText = twentyParts[insertAt - 1];
    if (previousText?.text === ") ÷20 = ") previousText.text = ") = ";
    twentyParts.splice(insertAt, 0, { type: "field", field: "20片总净重", readonly_display: true }, { type: "text", text: " ÷20 = " });
  }
}
await fs.writeFile(uvTwentyTabletsPath, `${JSON.stringify(uvTwentyTablets, null, 2)}\n`);

let uvMethod = await fs.readFile(uvMethodPath, "utf8");
uvMethod = uvMethod.replaceAll("平均粒重", "平均片重");
await fs.writeFile(uvMethodPath, uvMethod);

console.log(`Created UV calculation template and updated ${changed} UV content assignments; patched UV theoretical inputs.`);
