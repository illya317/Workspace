#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const configRoot = path.join(root, "config/pharma-ops");
const hplcPath = path.join(configRoot, "methods/hplc.yaml");
const mapping = JSON.parse(await fs.readFile(path.join(configRoot, "table_layouts/layout_mapping.json"), "utf8")).assignments;

function resolve(key, seen = new Set()) {
  const own = mapping[key] || {};
  if (seen.has(key)) return {};
  seen.add(key);
  const reused = own.reuse_from ? resolve(own.reuse_from, seen) : {};
  return { ...reused, ...own, params: { ...(reused.params || {}), ...(own.params || {}) } };
}

let hplc = await fs.readFile(hplcPath, "utf8");
if (!hplc.includes("  HPLC简表:")) {
  hplc = hplc.replace("  HPLC:\n", `  HPLC简表:\n    色谱:\n    - name: 对照1-峰面积\n      type: number\n      attr: fillable\n    - name: 对照2-峰面积\n      type: number\n      attr: fillable\n    - name: 对照平均峰面积\n      type: number\n      attr: fillable\n    - name: 对照RSD\n      unit: '%'\n      type: number\n      attr: fillable\n    - name: 样1-峰面积\n      type: number\n      attr: fillable\n    - name: 样1-平均峰面积\n      type: number\n      attr: fillable\n    - name: 样1-含量\n      unit: '%'\n      type: number\n      attr: fillable\n    - name: 样2-峰面积\n      type: number\n      attr: fillable\n    - name: 样2-平均峰面积\n      type: number\n      attr: fillable\n    - name: 样2-含量\n      unit: '%'\n      type: number\n      attr: fillable\n    - name: 平均含量\n      unit: '%'\n      type: number\n      attr: fillable\n    - name: RD\n      unit: '%'\n      type: number\n      attr: fillable\n  HPLC:\n`);
}
if (!hplc.includes("  含量均匀度简表:")) {
  hplc = hplc.replace("  含量均匀度:\n", `  含量均匀度简表:\n    测定:\n    - repeat:\n        count: 10\n        fields:\n        - name: 样{序号}-含量\n          unit: '%'\n          type: number\n          attr: fillable\n    - name: 平均含量\n      unit: '%'\n      type: number\n      attr: fillable\n    - name: S\n      type: number\n      attr: fillable\n    - name: A_2.2S\n      type: number\n      attr: fillable\n  含量均匀度:\n`);
}
await fs.writeFile(hplcPath, hplc);

const targets = new Map();
for (const key of Object.keys(mapping)) {
  const layout = resolve(key);
  const [prefix, product, stage, testName] = key.split("/");
  if (prefix !== "products") continue;
  if (layout.template_id === "parents/hplc_content_full" && layout.params?.hplc_weighing_variant === "none" && testName === "content") {
    targets.set(`${product}:${stage}:${testName}`, ["HPLC", "HPLC简表"]);
  }
  if (layout.template_id === "parents/content_uniformity_hplc_full") {
    targets.set(`${product}:${stage}:${testName}`, ["含量均匀度", "含量均匀度简表"]);
  }
}

let changed = 0;
for (const fileName of await fs.readdir(path.join(configRoot, "record_templates"))) {
  if (!fileName.endsWith(".yaml")) continue;
  const product = fileName.replace(/\.yaml$/, "");
  const filePath = path.join(configRoot, "record_templates", fileName);
  const lines = (await fs.readFile(filePath, "utf8")).split("\n");
  let stage = "";
  let testName = "";
  for (let index = 0; index < lines.length; index += 1) {
    const stageMatch = lines[index].match(/^  ([a-z_]+):$/);
    if (stageMatch) stage = stageMatch[1];
    const englishMatch = lines[index].match(/^      英文名: (.+)$/);
    if (englishMatch) testName = englishMatch[1].trim();
    const target = targets.get(`${product}:${stage}:${testName}`);
    if (!target) continue;
    const [from, to] = target;
    if (lines[index].trim() === `方法: ${from}`) {
      lines[index] = lines[index].replace(`方法: ${from}`, `方法: ${to}`);
      changed += 1;
    }
  }
  await fs.writeFile(filePath, lines.join("\n"));
}

console.log(`Updated ${changed} record-template method references to simple HPLC methods.`);
