import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "pharma-ops",
  "table_layouts",
  "templates",
  "microbiology",
);
const FILES = [
  "aerobic_count_observation.json",
  "mold_yeast_count_observation.json",
];

function patchPart(part) {
  if (part.field_key?.endsWith("/selected_count_source")) {
    return {
      ...part,
      type: "select",
      options: ["1:10", "1:100", "1:1000"],
      width: "7rem",
      underline: false,
    };
  }
  if (part.field_key?.endsWith("/selected_total_count")) {
    const summaryDay = part.field_key.includes("/mold_yeast/") ? 7 : 5;
    return {
      ...part,
      type: "microbial_selected_total",
      width: "7rem",
      underline: false,
      summary_day: summaryDay,
      readonly_display: true,
    };
  }
  return part;
}

function patchFile(fileName) {
  const filePath = resolve(ROOT, fileName);
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  for (const block of data.blocks || []) {
    for (const row of block.rows || []) {
      for (const cell of row.cells || []) {
        if (Array.isArray(cell.parts)) cell.parts = cell.parts.map(patchPart);
      }
    }
  }
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

for (const file of FILES) patchFile(file);
