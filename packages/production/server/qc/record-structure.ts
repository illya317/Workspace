import "server-only";
import path from "path";
import { asArray, asRecord, asString, readJson, values } from "./layout-block-utils";
import { resolvePharmaOpsRoot } from "./source";
import type {
  QcLayoutBlock,
  QcTemplateDetail,
  QcTemplateMethodField,
  QcTemplateMethodGroup,
  QcTemplateStage,
  QcTemplateTestItem,
} from "./types";

const TEMPLATE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function asBoolean(value: unknown) {
  return value === true;
}

function sourceRef(value: unknown) {
  const source = asRecord(value);
  if (!Object.keys(source).length) return undefined;
  return {
    type: asString(source.type) || undefined,
    fieldKey: asString(source.field_key || source.fieldKey) || undefined,
  };
}

function standardText(recordConfig: Record<string, unknown>) {
  const template = asString(recordConfig.standard_template);
  const params = asRecord(recordConfig.standard_params);
  if (template === "variation_difference_limit") {
    const basis = asString(params.basis, "平均片重");
    const limit = asString(params.limit, "7.0");
    const differenceName = asString(params.difference_name, "重量差异");
    const maxOver = asString(params.max_over, "2");
    const unit = asString(params.unit, "片");
    const oneUnit = asString(params.one_unit, `一${unit}`);
    return `差异限度应为${basis}的±${limit}%以内，如有超出${differenceName}限度的不得多于${maxOver}${unit}，并不得有${oneUnit}超出限度一倍。`;
  }
  if (template === "moisture_s_limit") return `水分不得过${asString(params.limit)}%。`;
  if (template === "appearance_description") return asString(params.description);
  if (template === "plain_text") return asString(params.text);
  if (template === "dissolution_release_limit") return `限度为标示量的${asString(params.limit)}%。`;
  if (template === "content_assay_range") {
    return `${asString(params.subject, "含量")}${asString(params.phrase, "应为")} ${asString(params.lower)}%～${asString(params.upper)}%。`;
  }
  if (template === "microbial_limit_standard") {
    const amount = asString(params.sample_amount, "1");
    const unit = asString(params.sample_unit, "g");
    const aerobicLimit = asString(params.aerobic_limit, "10³");
    const yeastMoldLimit = asString(params.yeast_mold_limit, "10²");
    return `每${amount}${unit}供试品中，大肠埃希菌不得检出；需氧菌总数不得过${aerobicLimit}cfu，霉菌和酵母菌总数不得过${yeastMoldLimit}cfu。`;
  }
  const values = Object.entries(params).map(([key, value]) => `${key}=${String(value)}`);
  return values.length ? `${template} (${values.join(", ")})` : template || undefined;
}

function cleanupItems(recordConfig: Record<string, unknown>) {
  if (asString(recordConfig.cleanup_template) !== "standard_cleanup") return [];
  return [
    "关闭电源",
    "清洁设备及房间",
    "检查仪器、设备，填写《仪器使用记录》",
    "更换仪器、设备状态标识",
  ];
}

function methodField(rawField: unknown): QcTemplateMethodField {
  const field = asRecord(rawField);
  return {
    name: asString(field.name),
    fieldKey: asString(field.field_key || field.fieldKey),
    group: asString(field.group),
    type: asString(field.type) || undefined,
    attr: asString(field.attr) || undefined,
    unit: asString(field.unit) || undefined,
    formula: asString(field.formula) || undefined,
    rule: asString(field.rule) || undefined,
    referenceFieldKey: asString(field.reference_field_key || field.referenceFieldKey) || undefined,
    valueSource: sourceRef(field.value_source || field.valueSource),
    options: asArray(field.options).map((option) => asString(option)).filter(Boolean),
    defaultValue: asString(field.default_value ?? field.defaultValue) || undefined,
    recommendedValue: asString(field.suggested_value ?? field.recommendedValue) || undefined,
  };
}

function methodGroup(rawGroup: unknown): QcTemplateMethodGroup {
  const group = asRecord(rawGroup);
  return {
    name: asString(group.name),
    fields: asArray(group.fields).map(methodField),
  };
}

function toTestItem(test: Record<string, unknown>): QcTemplateTestItem {
  const recordConfig = asRecord(test.record_config);
  const copiedFrom = asRecord(test.copied_from || test.copiedFrom);
  return {
    sequence: asString(test.sequence),
    name: asString(test.name),
    englishName: asString(test.key),
    methodName: asString(test.method),
    standardText: standardText(recordConfig),
    conclusionName: asString(recordConfig.conclusion_name) || undefined,
    hasNumericConclusion: asBoolean(recordConfig.has_numeric_conclusion),
    cleanupItems: cleanupItems(recordConfig),
    layout: undefined,
    layoutBlocks: asArray(test.layout_blocks) as QcLayoutBlock[],
    methodFile: asString(test.method_ref || test.method_file) || undefined,
    methodGroups: asArray(test.method_groups).map(methodGroup),
    copyFromPackaging: asBoolean(test.copy_from_packaging ?? test.copyFromPackaging),
    copiedFrom: Object.keys(copiedFrom).length ? {
      stage: asString(copiedFrom.stage) || undefined,
      sequence: asString(copiedFrom.sequence) || undefined,
      key: asString(copiedFrom.key) || undefined,
      name: asString(copiedFrom.name) || undefined,
    } : undefined,
    packagingReferencePhrases: asArray(test.packaging_reference_phrases ?? test.packagingReferencePhrases).map((phrase) => asString(phrase)).filter(Boolean),
  };
}

function precheckFiles(precheck: Record<string, unknown>) {
  return asArray(precheck["文件清单"]).map((file) => {
    const data = asRecord(file);
    return { name: asString(data["名称"]), code: asString(data["编码"]) };
  });
}

function precheckItems(precheck: Record<string, unknown>) {
  return asArray(precheck["确认项"]).map((item) => ({ name: asString(asRecord(item)["名称"]) }));
}

async function fullStage(configRoot: string, productKey: string, stageKey: string) {
  return asRecord(await readJson(path.join(configRoot, "full", `${productKey}_${stageKey}_full.json`)).catch(() => ({})));
}

async function toStage(configRoot: string, productKey: string, rawStage: unknown): Promise<QcTemplateStage> {
  const stage = asRecord(rawStage);
  const stageKey = asString(stage.key);
  const full = await fullStage(configRoot, productKey, stageKey);
  const precheck = asRecord(asRecord(await readJson(path.join(configRoot, "records", `${productKey}.json`)).catch(() => ({}))).stages);
  const stageRecord = asRecord(precheck[stageKey]);
  const precheckRaw = asRecord(stageRecord.precheck);
  const info = Object.fromEntries(Object.entries(asRecord(precheckRaw["顶部信息"])).map(([key, value]) => [key, asString(value)]));
  const files = precheckFiles(precheckRaw);
  const items = precheckItems(precheckRaw);
  return {
    key: stageKey,
    label: asString(stage.label, stageKey),
    precheckItemCount: items.length,
    documentCount: files.length,
    precheckInfo: info,
    precheckFiles: files,
    precheckItems: items,
    precheckLayoutBlocks: asArray(asRecord(full.precheck_full).layout_blocks) as QcLayoutBlock[],
    experimentLayoutBlocks: asArray(asRecord(full.experiment_projects_full).layout_blocks) as QcLayoutBlock[],
    tests: asArray(stage.tests).map((test) => toTestItem(asRecord(test))),
  };
}

export async function getQcTemplateDetailFromConfig(templateId: string): Promise<QcTemplateDetail> {
  if (!TEMPLATE_ID_PATTERN.test(templateId)) {
    throw new Error("Invalid QC template id");
  }

  const source = await resolvePharmaOpsRoot();
  if (!source.available) {
    return { source, id: templateId, fileName: `${templateId}.json`, productName: templateId, stages: [], methodFileCount: 0, layoutAssignmentCount: 0 };
  }

  const aggregate = asRecord(await readJson(path.join(source.configRoot, "product_stage_tests.json")));
  const product = asRecord(values(aggregate.products).find((item) => asString(asRecord(item).key) === templateId));
  if (!Object.keys(product).length) {
    throw new Error("QC product template not found");
  }
  const stages = await Promise.all(Object.values(asRecord(product.stages)).map((stage) => toStage(source.configRoot, templateId, stage)));
  const methodRefs = new Set(stages.flatMap((stage) => stage.tests.map((test) => test.methodFile).filter(Boolean)));

  return {
    source,
    id: templateId,
    fileName: `${templateId}.json`,
    productName: asString(product.name, templateId),
    stages,
    methodFileCount: methodRefs.size,
    layoutAssignmentCount: stages.reduce((sum, stage) => sum + stage.tests.length, 0),
  };
}
