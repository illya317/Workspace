#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const mappingPath = path.join(root, "config/pharma-ops/table_layouts/layout_mapping.json");
const multiCalcPath = path.join(root, "config/pharma-ops/table_layouts/templates/calculation/hplc_impurity_multi_component_calculation.json");
const mapping = JSON.parse(await fs.readFile(mappingPath, "utf8"));

let changed = 0;
for (const [key, assignment] of Object.entries(mapping.assignments)) {
  if (!key.endsWith("/related_substances")) continue;
  const rows = assignment.params?.related_peak_rows;
  const resultRows = assignment.params?.related_result_rows;
  if (!Array.isArray(rows)) continue;
  const fields = new Set(rows.map((row) => row.field));
  if (fields.has("对照溶液峰面积") && !fields.has("供试品单杂峰面积")) {
    rows.push({ group: "供试品溶液", item: "其他单个最大峰面积", field: "供试品单杂峰面积" });
    changed += 1;
  }
  if (fields.has("对照溶液峰面积") && !fields.has("供试品总杂峰面积")) {
    rows.push({ group: "供试品溶液", item: "总杂质峰面积", field: "供试品总杂峰面积" });
    changed += 1;
  }
  if (Array.isArray(resultRows)) {
    const resultBlob = JSON.stringify(resultRows);
    if (!resultBlob.includes('"field":"单杂"')) {
      resultRows.push({
        label: "单杂%=",
        parts: [
          { type: "field", field: "供试品单杂峰面积" },
          { type: "text", text: " / " },
          { type: "field", field: "对照溶液峰面积" },
          { type: "text", text: " ×100% = " },
          { type: "field", field: "单杂", readonly_display: true },
          { type: "text", text: "%" },
        ],
      });
      changed += 1;
    }
    if (!resultBlob.includes('"field":"总杂"')) {
      resultRows.push({
        label: "总杂%=",
        parts: [
          { type: "field", field: "供试品总杂峰面积" },
          { type: "text", text: " / " },
          { type: "field", field: "对照溶液峰面积" },
          { type: "text", text: " ×100% = " },
          { type: "field", field: "总杂", readonly_display: true },
          { type: "text", text: "%" },
        ],
      });
      changed += 1;
    }
  }
}

await fs.writeFile(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`);

const multiCalc = JSON.parse(await fs.readFile(multiCalcPath, "utf8"));
const rows = multiCalc.blocks?.[1]?.rows;
if (Array.isArray(rows) && !JSON.stringify(rows).includes('"field":"测定是否符合规定"')) {
  rows.push({
    cells: [
      { text: "测定是否符合规定" },
      { colspan: 7, parts: [{ type: "field", field: "测定是否符合规定", readonly_display: true }] },
    ],
  });
  changed += 1;
}
await fs.writeFile(multiCalcPath, `${JSON.stringify(multiCalc, null, 2)}\n`);
console.log(`Patched ${changed} related-substances peak-area/calculation rows.`);
