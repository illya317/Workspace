#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const configRoot = path.join(root, "config/pharma-ops");
const templatesRoot = path.join(configRoot, "table_layouts/templates");
const mappingPath = path.join(configRoot, "table_layouts/layout_mapping.json");
const auditPath = path.join(configRoot, "source_docs/docs/coverage/audit/workspace_template_source_audit_report.json");

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

function parseMissingHeading(entry, sequence) {
  const match = entry.match(/^(\d+(?:\.\d+)*)\s+(.+?)\s+\((heading|inline)\)$/);
  if (!match || !match[1].startsWith(`${sequence}.`)) return null;
  const suffix = match[1].slice(sequence.length + 1);
  const title = match[2].trim();
  if (/^(标准规定|实验结果异常处理|清场|结论|原始数据)$/.test(title)) return null;
  return { section_suffix: suffix, title };
}

const sectionedTemplate = {
  schema_version: 2,
  template_id: "operation/identification_sectioned_steps",
  title: "鉴别分节操作步骤",
  category: "operation",
  subcomponent: true,
  status: "pilot",
  blocks: [
    {
      type: "sectioned_operation_steps",
      steps_param: "identification_steps",
      className: "section-body layout-operation-text-block",
      module_order: 20,
      order: 136,
    },
  ],
  source_refs: [
    {
      product: "all",
      section_no: "鉴别 操作方法分节步骤",
      md: "schema/md_canonical/*.md",
    },
  ],
};
await writeJson(path.join(templatesRoot, "operation/identification_sectioned_steps.json"), sectionedTemplate);

const operationTemplatePath = path.join(templatesRoot, "operation/identification_operation.json");
const operationTemplate = await readJson(operationTemplatePath);
operationTemplate.blocks = (operationTemplate.blocks || []).map((block) => {
  if (block.variant_param !== "identification_operation_method_variant") return block;
  return {
    ...block,
    variants: {
      ...block.variants,
      sectioned_steps: {
        template_id: "operation/identification_sectioned_steps",
        title: "鉴别分节操作步骤",
      },
    },
  };
});
await writeJson(operationTemplatePath, operationTemplate);

const mapping = await readJson(mappingPath);
const audit = await readJson(auditPath);
let updated = 0;

for (const product of audit.products || []) {
  for (const stage of product.stages || []) {
    for (const test of stage.tests || []) {
      if (test.templateId !== "parents/identification_full") continue;
      const assignmentKey = Object.keys(mapping.assignments || {}).find((candidate) => (
        candidate.startsWith(`products/${product.productId}/${stage.key}/`)
        && mapping.assignments[candidate]?.template_id === "parents/identification_full"
      ));
      if (!assignmentKey) continue;
      const assignment = mapping.assignments[assignmentKey];
      assignment.params ||= {};

      const stepsBySuffix = new Map();
      for (const entry of test.missingHeadings || []) {
        const parsed = parseMissingHeading(entry, test.sequence);
        if (!parsed) {
          if (/\s原始数据\s+\(heading\)$/.test(entry)) assignment.params.identification_attachment_variant = "raw";
          continue;
        }
        if (!stepsBySuffix.has(parsed.section_suffix)) stepsBySuffix.set(parsed.section_suffix, parsed);
      }
      const steps = [...stepsBySuffix.values()].sort((a, b) => a.section_suffix.localeCompare(b.section_suffix, "zh-Hans-CN", { numeric: true }));
      if (steps.length) {
        assignment.params.identification_operation_method_variant = "sectioned_steps";
        assignment.params.identification_steps = steps;
        updated += 1;
      }
      if ((test.missingHeadings || []).some((entry) => /\s原始数据\s+\(heading\)$/.test(entry))) updated += 1;
    }
  }
}

await writeJson(mappingPath, mapping);
console.log(`Updated ${updated} identification mapping entries/signals.`);
