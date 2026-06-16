import "server-only";
import path from "path";
import { readdir, readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { loadQcLayoutBlocks } from "./layout-blocks";
import { buildPrecheckLayoutBlocks } from "./precheck-layout";
import { buildQcMethodGroups, loadQcMethods } from "./method-fields";
import { resolvePharmaOpsRoot } from "./source";
import { cleanupItems, summarizeStandard } from "./test-metadata";
import type {
  QcTemplateDetail,
  QcTemplateLayoutAssignment,
  QcTemplateMethodGroup,
  QcTemplateStage,
  QcTemplateTestItem,
} from "./types";

type MethodIndex = Awaited<ReturnType<typeof loadQcMethods>>;
type LayoutAssignments = Record<string, Record<string, unknown>>;
type OperationParamIndex = Record<string, Record<string, unknown>>;

const TEMPLATE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

async function readYamlFile(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, "utf8");
  return parseYaml(text, { uniqueKeys: false });
}

async function loadLayoutAssignments(configRoot: string): Promise<LayoutAssignments> {
  const filePath = path.join(configRoot, "table_layouts", "layout_mapping.json");
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  return asRecord(asRecord(raw).assignments) as LayoutAssignments;
}

async function loadOperationParams(configRoot: string): Promise<OperationParamIndex> {
  const root = path.join(configRoot, "table_layouts");
  const files = (await readdir(root)).filter((file) => file.endsWith("_operation_params.yaml"));
  const index: OperationParamIndex = {};
  for (const file of files) {
    const paramKey = file.replace(/\.yaml$/, "");
    const data = asRecord(await readYamlFile(path.join(root, file)));
    for (const [product, stages] of Object.entries(asRecord(data.products))) {
      for (const [stage, tests] of Object.entries(asRecord(stages))) {
        for (const [test, entry] of Object.entries(asRecord(tests))) {
          const params = asRecord(asRecord(entry)["操作方法参数"]);
          const key = `products/${product}/${stage}/${test}`;
          if (Object.keys(params).length) index[key] = { ...index[key], [paramKey]: params };
        }
      }
    }
  }
  return index;
}

function resolveLayout(key: string, assignments: LayoutAssignments, seen = new Set<string>()): QcTemplateLayoutAssignment | undefined {
  const own = assignments[key];
  if (!own || seen.has(key)) return undefined;
  seen.add(key);
  const reusedFrom = asString(own.reuse_from) || undefined;
  const reused = reusedFrom ? resolveLayout(reusedFrom, assignments, seen) : undefined;
  const params = asRecord(own.params);

  return {
    key,
    templateId: asString(own.template_id, reused?.templateId ?? ""),
    status: asString(own.status, reused?.status ?? "unknown"),
    sourceRef: asString(own.source_ref) || reused?.sourceRef,
    familyId: asString(own.family_id) || reused?.familyId,
    reusedFrom,
    params: Object.keys(params).length ? params : reused?.params ?? {},
  };
}

function toTestItem(
  templateId: string,
  stageKey: string,
  raw: unknown,
  methods: MethodIndex,
  layouts: LayoutAssignments,
  operationParams: OperationParamIndex,
): QcTemplateTestItem {
  const test = asRecord(raw);
  const methodName = asString(test["方法"]);
  const englishName = asString(test["英文名"]);
  const method = buildQcMethodGroups(methodName, methods, stageKey, englishName || `t${asString(test["序号"], "0")}`);
  const conclusion = asRecord(test["结论判定"]);
  const conclusionRule = asString(conclusion.rule);
  const conclusionFieldKey = `${stageKey}/${englishName || "test"}/conclusion/result`;
  const groupsWithConclusion: QcTemplateMethodGroup[] = conclusionRule
    ? [...method.groups, {
      name: "结论",
      fields: [{
        name: "result",
        fieldKey: conclusionFieldKey,
        group: "结论",
        type: "select",
        attr: "calculated",
        rule: conclusionRule,
        options: ["符合", "不符合"],
      }],
    }]
    : method.groups;
  const layoutKey = `products/${templateId}/${stageKey}/${englishName}`;
  const layout = resolveLayout(layoutKey, layouts);
  return {
    sequence: asString(test["序号"]),
    name: asString(test["名称"]),
    englishName,
    methodName,
    standardText: summarizeStandard(test),
    conclusionName: asString(test["结论名称"]) || undefined,
    conclusionFieldKey: conclusionRule ? conclusionFieldKey : undefined,
    hasNumericConclusion: test["结论含数值"] === true,
    cleanupItems: cleanupItems(test),
    layout: layout ? { ...layout, params: { ...operationParams[layoutKey], ...layout.params } } : undefined,
    methodFile: method.fileName,
    methodGroups: groupsWithConclusion,
  };
}

async function toStage(
  configRoot: string,
  templateId: string,
  productName: string,
  key: string,
  raw: unknown,
  methods: MethodIndex,
  layouts: LayoutAssignments,
  operationParams: OperationParamIndex,
): Promise<QcTemplateStage> {
  const stage = asRecord(raw);
  const precheck = asRecord(stage["检验前确认"]);
  const precheckInfo = Object.fromEntries(
    Object.entries(asRecord(precheck["顶部信息"])).map(([key, value]) => [key, asString(value)]),
  );
  const precheckFiles = asArray(precheck["文件清单"]).map((file) => {
    const data = asRecord(file);
    return { name: asString(data["名称"]), code: asString(data["编码"]) };
  });
  const precheckItems = asArray(precheck["确认项"]).map((item) => ({ name: asString(asRecord(item)["名称"]) }));
  const tests = asArray(stage["检测项"]).map((test) => toTestItem(templateId, key, test, methods, layouts, operationParams));
  const precheckLayoutBlocks = await buildPrecheckLayoutBlocks(
    configRoot,
    productName,
    asString(stage["显示名"], key),
    precheckInfo,
    precheckFiles,
    precheckItems,
    asRecord(precheck["环境确认"]),
  );
  return {
    key,
    label: asString(stage["显示名"], key),
    precheckItemCount: precheckItems.length,
    documentCount: precheckFiles.length,
    precheckInfo,
    precheckFiles,
    precheckItems,
    precheckLayoutBlocks,
    tests,
  };
}

export async function getQcTemplateDetail(templateId: string): Promise<QcTemplateDetail> {
  if (!TEMPLATE_ID_PATTERN.test(templateId)) {
    throw new Error("Invalid QC template id");
  }

  const source = await resolvePharmaOpsRoot();
  if (!source.available) {
    return { source, id: templateId, fileName: `${templateId}.yaml`, productName: templateId, stages: [], methodFileCount: 0, layoutAssignmentCount: 0 };
  }

  const fileName = `${templateId}.yaml`;
  const templatePath = path.join(source.configRoot, "record_templates", fileName);
  const [rawTemplate, methods, layouts, operationParams] = await Promise.all([
    readYamlFile(templatePath),
    loadQcMethods(source.configRoot),
    loadLayoutAssignments(source.configRoot),
    loadOperationParams(source.configRoot),
  ]);
  const template = asRecord(rawTemplate);
  const stages = Object.entries(asRecord(template["阶段"]))
    .map(([key, stage]) => toStage(source.configRoot, templateId, asString(template["产品名称"], templateId), key, stage, methods, layouts, operationParams));
  const resolvedStages = await Promise.all(stages);
  await Promise.all(resolvedStages.flatMap((stage) => stage.tests.map(async (test) => {
    test.layoutBlocks = await loadQcLayoutBlocks(source.configRoot, test.layout);
  })));

  return {
    source,
    id: templateId,
    fileName,
    productName: asString(template["产品名称"], templateId),
    stages: resolvedStages,
    methodFileCount: new Set(Object.values(methods).map((method) => method.fileName)).size,
    layoutAssignmentCount: Object.keys(layouts).length,
  };
}
