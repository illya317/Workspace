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

await writeJson(path.join(templatesRoot, "operation/sectioned_steps.json"), {
  schema_version: 2,
  template_id: "operation/sectioned_steps",
  title: "补充分节标题",
  category: "operation",
  subcomponent: true,
  status: "pilot",
  blocks: [
    {
      type: "sectioned_operation_steps",
      steps_param: "layout_section_steps",
      module_order: 20,
      order: 137,
    },
  ],
});

async function addSectionedInclude(relPath) {
  const file = path.join(templatesRoot, relPath);
  const data = await readJson(file);
  const exists = (data.includes || []).some((entry) => entry.template_id === "operation/sectioned_steps");
  if (!exists) {
    data.includes = [
      ...(data.includes || []),
      {
        template_id: "operation/sectioned_steps",
        module_order: 20,
        order: 137,
      },
    ];
  }
  await writeJson(file, data);
}

await addSectionedInclude("operation/hplc_content_operation.json");
await addSectionedInclude("operation/content_uniformity_hplc_operation.json");

const mapping = await readJson(mappingPath);
const assignments = mapping.assignments || {};

const setSteps = (key, steps) => {
  assignments[key].params ||= {};
  assignments[key].params.layout_section_steps = steps;
};

setSteps("products/compound_rutin/intermediate/content", [
  { section_suffix: "5.1", title: "芦丁含量对照品溶液制备" },
]);
setSteps("products/compound_rutin/packaging/content", [
  { section_suffix: "5.1", title: "芦丁含量对照品溶液制备" },
  { section_suffix: "5.2", title: "维生素C含量取本品研细，精密称取① g② g（约相当于维生素C 0.2g），分别置 ml（100ml） 的量瓶中，加新沸过的冷水 ml（100ml）与稀醋酸 ml（10ml）的混合液 ml（40ml）振摇使溶解，再用混合液稀释至刻度，摇匀，用干燥滤纸迅速滤过，弃去初滤液，精密量取续滤液 ml（50ml），加淀粉指示液 ml（10ml），立即用碘滴定液 mol/L（0.05mol/L）滴定，至溶液显蓝色并持续30秒不褪，每1ml的碘滴定液相当于8.806mg的C6H8O6。" },
  { section_suffix: "5.2.1", title: "称重" },
]);
setSteps("products/methimazole/packaging/content_uniformity", [
  { section_suffix: "4.1", title: "称重" },
  { section_suffix: "4.2.1", title: "对照品计算" },
  { section_suffix: "4.2.2", title: "供试品计算" },
]);
setSteps("products/simvastatin/packaging/content_uniformity", [
  { section_suffix: "5.1", title: "称重" },
]);
setSteps("products/spironolactone/packaging/content_uniformity", [
  { section_suffix: "5.1", title: "对照称样" },
]);

await writeJson(mappingPath, mapping);
console.log("Added generic sectioned layout steps.");
