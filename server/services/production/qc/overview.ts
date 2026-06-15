import "server-only";
import path from "path";
import { readdir, readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { resolvePharmaOpsRoot } from "./source";
import type {
  QcConfigOverview,
  QcLayoutAssignmentSample,
  QcLayoutMappingSummary,
  QcMethodSummary,
  QcProductSummary,
  QcProductStageSummary,
  QcRecordTemplateSummary,
} from "./types";

async function readYamlFile(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, "utf8");
  return parseYaml(text, { uniqueKeys: false });
}

async function listFiles(dir: string, ext: string) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function countProductItems(stages: unknown): QcProductStageSummary[] {
  if (!Array.isArray(stages)) return [];
  return stages.map((stage) => {
    const data = asRecord(stage);
    const part = String(data.part ?? "");
    const items = Array.isArray(data.items) ? data.items : [];
    return { key: part, label: part, itemCount: items.length };
  });
}

async function loadProducts(configRoot: string): Promise<QcProductSummary[]> {
  const raw = asRecord(await readYamlFile(path.join(configRoot, "products.yaml")).catch(() => ({})));
  return Object.entries(raw).map(([name, stages]) => {
    const stageSummaries = countProductItems(stages);
    return {
      name,
      stageCount: stageSummaries.length,
      itemCount: stageSummaries.reduce((sum, stage) => sum + stage.itemCount, 0),
      stages: stageSummaries,
    };
  });
}

function summarizeTemplate(filePath: string, raw: unknown): QcRecordTemplateSummary {
  const data = asRecord(raw);
  const stages = asRecord(data["阶段"]);
  const stageValues = Object.entries(stages);
  const itemCount = stageValues.reduce((sum, [, stage]) => {
    const tests = asRecord(stage)["检测项"];
    return sum + (Array.isArray(tests) ? tests.length : 0);
  }, 0);

  return {
    id: path.basename(filePath, ".yaml"),
    fileName: path.basename(filePath),
    productName: String(data["产品名称"] ?? path.basename(filePath, ".yaml")),
    stageCount: stageValues.length,
    itemCount,
  };
}

async function loadRecordTemplates(configRoot: string): Promise<QcRecordTemplateSummary[]> {
  const files = await listFiles(path.join(configRoot, "record_templates"), ".yaml");
  const templates = await Promise.all(files.map(async (file) => summarizeTemplate(file, await readYamlFile(file))));
  return templates.sort((a, b) => a.productName.localeCompare(b.productName, "zh-Hans-CN"));
}

function countFields(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countFields(item), 0);
  }
  const data = asRecord(value);
  let total = typeof data.name === "string" ? 1 : 0;
  const repeat = asRecord(data.repeat);
  if (Array.isArray(repeat.fields)) total += countFields(repeat.fields);
  for (const child of Object.values(data)) {
    if (Array.isArray(child)) total += countFields(child);
  }
  return total;
}

async function loadMethods(configRoot: string): Promise<QcMethodSummary[]> {
  const files = await listFiles(path.join(configRoot, "methods"), ".yaml");
  return Promise.all(files.map(async (file) => {
    const methods = asRecord(asRecord(await readYamlFile(file)).methods);
    return {
      id: path.basename(file, ".yaml"),
      fileName: path.basename(file),
      methodCount: Object.keys(methods).length,
      fieldCount: countFields(methods),
    };
  }));
}

function summarizeLayoutMapping(raw: unknown): QcLayoutMappingSummary {
  const data = asRecord(raw);
  const assignments = asRecord(data.assignments);
  const statusCounts: Record<string, number> = {};
  const samples: QcLayoutAssignmentSample[] = [];

  for (const [key, assignmentRaw] of Object.entries(assignments)) {
    const assignment = asRecord(assignmentRaw);
    const status = String(assignment.status ?? "unknown");
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (samples.length < 8) {
      samples.push({
        key,
        templateId: String(assignment.template_id ?? ""),
        status,
        sourceRef: typeof assignment.source_ref === "string" ? assignment.source_ref : undefined,
      });
    }
  }

  return {
    schemaVersion: typeof data.schema_version === "number" ? data.schema_version : undefined,
    assignmentCount: Object.keys(assignments).length,
    statusCounts,
    samples,
  };
}

async function loadLayoutMapping(configRoot: string): Promise<QcLayoutMappingSummary> {
  const filePath = path.join(configRoot, "table_layouts", "layout_mapping.json");
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  return summarizeLayoutMapping(raw);
}

export async function getQcConfigOverview(): Promise<QcConfigOverview> {
  const source = await resolvePharmaOpsRoot();
  if (!source.available) {
    return { source, products: [], recordTemplates: [], methods: [], layoutMapping: summarizeLayoutMapping({}) };
  }

  const [products, recordTemplates, methods, layoutMapping] = await Promise.all([
    loadProducts(source.configRoot),
    loadRecordTemplates(source.configRoot),
    loadMethods(source.configRoot),
    loadLayoutMapping(source.configRoot),
  ]);

  return { source, products, recordTemplates, methods, layoutMapping };
}
