import "server-only";
import path from "path";
import { readdir } from "fs/promises";
import { asArray, asRecord, asString, readJson, values } from "./layout-block-utils";
import { resolvePharmaOpsRoot } from "./source";
import type {
  QcConfigOverview,
  QcLayoutMappingSummary,
  QcMethodSummary,
  QcProductSummary,
  QcRecordTemplateSummary,
} from "./types";

function emptyLayoutMapping(): QcLayoutMappingSummary {
  return {
    schemaVersion: 1,
    assignmentCount: 0,
    statusCounts: { embedded_json: 0 },
    samples: [],
  };
}

async function listJsonFiles(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function productSummary(product: Record<string, unknown>): QcProductSummary {
  const stages = asRecord(product.stages);
  const stageSummaries = Object.entries(stages).map(([key, rawStage]) => {
    const stage = asRecord(rawStage);
    return {
      key,
      label: asString(stage.label, key),
      itemCount: asArray(stage.tests).length,
    };
  });
  return {
    name: asString(product.name || product.productName || product.key),
    stageCount: stageSummaries.length,
    itemCount: stageSummaries.reduce((sum, stage) => sum + stage.itemCount, 0),
    stages: stageSummaries,
  };
}

function recordTemplateSummary(filePath: string, record: Record<string, unknown>): QcRecordTemplateSummary {
  const product = asRecord(record.product);
  const stages = Object.values(asRecord(record.stages));
  return {
    id: asString(product.key, path.basename(filePath, ".json")),
    fileName: path.basename(filePath),
    productName: asString(product.name, path.basename(filePath, ".json")),
    stageCount: stages.length,
    itemCount: stages.reduce<number>((sum, stage) => sum + asArray(asRecord(stage).tests).length, 0),
  };
}

function countMethodFields(method: Record<string, unknown>) {
  return asArray(method.method_groups)
    .reduce<number>((sum, group) => sum + asArray(asRecord(group).fields).length, 0);
}

async function loadMethodSummaries(configRoot: string): Promise<QcMethodSummary[]> {
  const files = await listJsonFiles(path.join(configRoot, "dedicated_methods"));
  return Promise.all(files.map(async (file) => {
    const method = asRecord(await readJson(file));
    return {
      id: asString(method.method_key, path.basename(file, ".json")),
      fileName: path.basename(file),
      methodCount: 1,
      fieldCount: countMethodFields(method),
    };
  }));
}

export async function getQcConfigOverview(): Promise<QcConfigOverview> {
  const source = await resolvePharmaOpsRoot();
  if (!source.available) {
    return { source, products: [], recordTemplates: [], methods: [], layoutMapping: emptyLayoutMapping() };
  }

  const [aggregate, recordFiles, methods] = await Promise.all([
    readJson(path.join(source.configRoot, "product_stage_tests.json")).then(asRecord),
    listJsonFiles(path.join(source.configRoot, "records")),
    loadMethodSummaries(source.configRoot),
  ]);
  const products = values(aggregate.products).map((product) => productSummary(asRecord(product)));
  const records = await Promise.all(recordFiles.map(async (file) => recordTemplateSummary(file, asRecord(await readJson(file)))));
  const layoutMapping = emptyLayoutMapping();
  layoutMapping.assignmentCount = products.reduce((sum, product) => sum + product.itemCount, 0);
  layoutMapping.statusCounts.embedded_json = layoutMapping.assignmentCount;

  return {
    source,
    products: products.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")),
    recordTemplates: records.sort((a, b) => a.productName.localeCompare(b.productName, "zh-Hans-CN")),
    methods,
    layoutMapping,
  };
}
