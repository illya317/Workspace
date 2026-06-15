import "server-only";
import path from "path";
import { readdir, readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { loadQcLayoutBlocks } from "./layout-blocks";
import { resolvePharmaOpsRoot } from "./source";
import type {
  QcTemplateDetail,
  QcTemplateLayoutAssignment,
  QcTemplateMethodField,
  QcTemplateMethodGroup,
  QcTemplateStage,
  QcTemplateTestItem,
} from "./types";

type MethodIndex = Record<string, { fileName: string; definition: Record<string, unknown> }>;
type LayoutAssignments = Record<string, Record<string, unknown>>;

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

async function listYamlFiles(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function summarizeStandard(test: Record<string, unknown>) {
  if (typeof test["标准规定"] === "string") return test["标准规定"];
  const template = asString(test["标准规定模板"]);
  const params = asRecord(test["标准规定参数"]);
  if (!template) return undefined;
  const values = Object.entries(params).map(([key, value]) => `${key}=${String(value)}`);
  return values.length ? `${template} (${values.join(", ")})` : template;
}

async function loadMethods(configRoot: string): Promise<MethodIndex> {
  const files = await listYamlFiles(path.join(configRoot, "methods"));
  const pairs = await Promise.all(files.map(async (filePath) => {
    const methods = asRecord(asRecord(await readYamlFile(filePath)).methods);
    return Object.entries(methods).map(([name, definition]) => [
      name,
      { fileName: path.basename(filePath), definition: asRecord(definition) },
    ] as const);
  }));
  return Object.fromEntries(pairs.flat());
}

function flattenFields(group: string, value: unknown): QcTemplateMethodField[] {
  return asArray(value).flatMap((item) => {
    const field = asRecord(item);
    const repeat = asRecord(field.repeat);
    if (Array.isArray(repeat.fields)) {
      return flattenFields(group, repeat.fields).map((child) => ({
        ...child,
        name: child.name.replace("{序号}", `1-${asString(repeat.count, "N")}`),
      }));
    }
    const name = asString(field.name);
    if (!name) return [];
    return [{
      name,
      group,
      type: asString(field.type) || undefined,
      attr: asString(field.attr) || undefined,
      unit: asString(field.unit) || undefined,
      formula: asString(field.formula) || undefined,
    }];
  });
}

function methodGroups(methodName: string, methods: MethodIndex): { fileName?: string; groups: QcTemplateMethodGroup[] } {
  const method = methods[methodName] ?? methods[methodName.split("-")[0]];
  if (!method) return { groups: [] };
  const base = methods[asString(method.definition.extends)];
  const groupSource = base ? { ...base.definition, ...method.definition } : method.definition;
  const groups = Object.entries(groupSource)
    .filter(([name]) => !["extends", "extra"].includes(name))
    .map(([name, value]) => ({ name, fields: flattenFields(name, value) }))
    .filter((group) => group.fields.length > 0);
  const extra = flattenFields("扩展", method.definition.extra);
  return { fileName: method.fileName, groups: extra.length ? [...groups, { name: "扩展", fields: extra }] : groups };
}

async function loadLayoutAssignments(configRoot: string): Promise<LayoutAssignments> {
  const filePath = path.join(configRoot, "table_layouts", "layout_mapping.json");
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  return asRecord(asRecord(raw).assignments) as LayoutAssignments;
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
): QcTemplateTestItem {
  const test = asRecord(raw);
  const methodName = asString(test["方法"]);
  const englishName = asString(test["英文名"]);
  const method = methodGroups(methodName, methods);
  return {
    sequence: asString(test["序号"]),
    name: asString(test["名称"]),
    englishName,
    methodName,
    standardText: summarizeStandard(test),
    conclusionName: asString(test["结论名称"]) || undefined,
    hasNumericConclusion: test["结论含数值"] === true,
    layout: resolveLayout(`products/${templateId}/${stageKey}/${englishName}`, layouts),
    methodFile: method.fileName,
    methodGroups: method.groups,
  };
}

function toStage(
  templateId: string,
  key: string,
  raw: unknown,
  methods: MethodIndex,
  layouts: LayoutAssignments,
): QcTemplateStage {
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
  return {
    key,
    label: asString(stage["显示名"], key),
    precheckItemCount: precheckItems.length,
    documentCount: precheckFiles.length,
    precheckInfo,
    precheckFiles,
    precheckItems,
    tests: asArray(stage["检测项"]).map((test) => toTestItem(templateId, key, test, methods, layouts)),
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
  const [rawTemplate, methods, layouts] = await Promise.all([
    readYamlFile(templatePath),
    loadMethods(source.configRoot),
    loadLayoutAssignments(source.configRoot),
  ]);
  const template = asRecord(rawTemplate);
  const stages = Object.entries(asRecord(template["阶段"]))
    .map(([key, stage]) => toStage(templateId, key, stage, methods, layouts));
  await Promise.all(stages.flatMap((stage) => stage.tests.map(async (test) => {
    test.layoutBlocks = await loadQcLayoutBlocks(source.configRoot, test.layout?.key);
  })));

  return {
    source,
    id: templateId,
    fileName,
    productName: asString(template["产品名称"], templateId),
    stages,
    methodFileCount: new Set(Object.values(methods).map((method) => method.fileName)).size,
    layoutAssignmentCount: Object.keys(layouts).length,
  };
}
