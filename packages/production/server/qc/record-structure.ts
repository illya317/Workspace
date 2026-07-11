import "server-only";
import path from "path";
import { loadQcLayoutBlocks } from "./layout-blocks";
import { standardCleanupItems } from "./editor-adapter-layout";
import { asArray, asRecord, asString, readJson, values } from "./layout-block-utils";
import { resolvePharmaOpsRoot } from "./source";
import type {
  QcLayoutBlock,
  QcTemplateDetail,
  QcTemplateLayoutAssignment,
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
  if (!template || template === "empty_standard") return undefined;
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
  if (template === "release_upper_limit") return `释放度不得过标示量的${asString(params.limit)}%。`;
  if (template === "average_content_lower_limit") return `平均含量不得低于标示量的${asString(params.limit)}%。`;
  if (template === "friability_loss_limit") return `减失重量不得过${asString(params.loss_limit)}%，且不得检出断裂、龟裂及粉碎的片。`;
  if (template === "disintegration_time_limit") return `应在${asString(params.limit_minutes)}分钟内全部崩解。`;
  if (template === "content_uniformity_a_2_2s") return `A+${asString(params.factor, "2.2")}S应不大于${asString(params.limit, "13")}。`;
  if (template === "identification_retention_time") return "供试品溶液主峰的保留时间应与对照品溶液主峰的保留时间一致。";
  if (template === "identification_tlc_spot_match") return "供试品色谱中，在与对照品色谱相应的位置上，应显相同颜色的斑点。";
  if (template === "numbered_standard_items") return numberedItemsText(asArray(params.items), asString(params.numbering_style));
  if (template === "grouped_numbered_standard_items") return groupedNumberedItemsText(asArray(params.groups));
  if (template === "content_assay_range") {
    return `${asString(params.subject, "含量")}${asString(params.phrase, "应为")} ${asString(params.lower)}%～${asString(params.upper)}%。`;
  }
  if (template === "multi_component_content_assay_range") return multiComponentContentText(asArray(params.components));
  if (template === "related_substances_total_peak_area_limit") return relatedTotalPeakText(params);
  if (template === "related_substances_single_peak_limit") return relatedSinglePeakText(params);
  if (template === "related_substances_single_total_limits") return relatedSingleTotalText(params);
  if (template === "allopurinol_related_substances_limits") return allopurinolRelatedLimitsText(params);
  if (template === "microbial_limit_standard") {
    const amount = asString(params.sample_amount, "1");
    const unit = asString(params.sample_unit, "g");
    const aerobicLimit = asString(params.aerobic_limit, "10³");
    const yeastMoldLimit = asString(params.yeast_mold_limit, "10²");
    return `每${amount}${unit}供试品中，大肠埃希菌不得检出；需氧菌总数不得过${aerobicLimit}cfu，霉菌和酵母菌总数不得过${yeastMoldLimit}cfu。`;
  }
  return undefined;
}

function numberedItemsText(items: unknown[], numberingStyle?: string) {
  const marker = numberingStyle === "arabic_colon" ? (index: number) => `${index + 1}.` : (index: number) => `${index + 1}、`;
  return items.map((item, index) => `${marker(index)}${asString(item)}`).filter(Boolean).join(" ");
}

function groupedNumberedItemsText(groups: unknown[]) {
  return groups.map((rawGroup, index) => {
    const group = asRecord(rawGroup);
    const prefix = asString(group.prefix, `${index + 1}、`);
    const text = asString(group.text) || asArray(group.items).map((item) => asString(item)).filter(Boolean).join(" ");
    return text ? `${prefix}${text}` : "";
  }).filter(Boolean).join(" ");
}

function multiComponentContentText(components: unknown[]) {
  return components.map((raw) => {
    const item = asRecord(raw);
    return `${asString(item.subject, "含量")}应为标示量的${asString(item.lower)}%～${asString(item.upper)}%`;
  }).filter(Boolean).join("；") + "。";
}

function relatedTotalPeakText(params: Record<string, unknown>) {
  const scope = asString(params.peak_scope);
  const excluded = asString(params.excluded_peaks);
  const prefix = scope ? `${scope}各杂质峰面积的和` : "各杂质峰面积的和";
  const excludedText = excluded ? `（${excluded}除外）` : "";
  return `${prefix}${excludedText}不得大于${comparisonLimit(params.comparison, params.limit)}。`;
}

function relatedSinglePeakText(params: Record<string, unknown>) {
  return `${asString(params.label, "单个杂质峰面积")}不得大于${comparisonLimit(params.comparison, params.multiple, params.limit)}。`;
}

function relatedSingleTotalText(params: Record<string, unknown>) {
  const comparison = params.comparison;
  const ignore = asString(params.ignore_note);
  const ignoreText = ignore ? `；${ignore}` : "";
  return `单个杂质峰面积不得大于${comparisonLimit(comparison, params.single_multiple, params.single_limit)}；各杂质峰面积的和不得大于${comparisonLimit(comparison, params.total_multiple, params.total_limit)}${ignoreText}。`;
}

function allopurinolRelatedLimitsText(params: Record<string, unknown>) {
  const named = asArray(params.named_impurities).map((raw) => {
    const item = asRecord(raw);
    return `${asString(item.name)}不得过${asString(item.limit)}%`;
  }).filter(Boolean).join("，");
  return `供试品溶液中如有与${namedImpurityNames(params)}保留时间一致的峰，其含量按外标法以峰面积计算，其中${named}；供试品溶液色谱图中如有其它杂质峰，按外标法以${asString(params.reference_name)}峰面积计算，其它单个杂质不得过${asString(params.other_single_limit)}%；其它杂质总量不得过${asString(params.total_limit)}%。`;
}

function namedImpurityNames(params: Record<string, unknown>) {
  return asArray(params.named_impurities).map((raw) => asString(asRecord(raw).name)).filter(Boolean).join("、");
}

function comparisonLimit(comparison: unknown, multiple: unknown, limit?: unknown) {
  const target = asString(comparison, "对照溶液主峰面积");
  const multipleText = asString(multiple);
  const limitText = asString(limit);
  if (!multipleText || multipleText === "1") return limitText ? `${target}（${limitText}%）` : target;
  return limitText ? `${target}的${multipleText}倍（${limitText}%）` : `${target}的${multipleText}倍`;
}

function cleanupItems(recordConfig: Record<string, unknown>) {
  if (asString(recordConfig.cleanup_template) !== "standard_cleanup") return [];
  return standardCleanupItems();
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
  const tests = asArray(stage.tests).map((test) => toTestItem(asRecord(test)));
  if (stageKey === "finished") {
    const microbiology = await microbiologyTestItem(configRoot, productKey, tests);
    if (microbiology && !tests.some((test) => test.englishName === microbiology.englishName)) tests.push(microbiology);
  }
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
    tests,
  };
}

async function microbiologyTestItem(configRoot: string, productKey: string, existingTests: QcTemplateTestItem[]): Promise<QcTemplateTestItem | undefined> {
  const layout = await microbiologyLayoutAssignment(configRoot, productKey);
  if (!layout) return undefined;
  const sourceRoot = path.join(configRoot, "source");
  const layoutBlocks = await loadQcLayoutBlocks(sourceRoot, layout).catch(() => []);
  if (!layoutBlocks?.length) return undefined;
  return {
    sequence: nextFinishedSequence(existingTests),
    name: "微生物限度检查",
    englishName: "microbial_limit",
    methodName: "微生物限度检查",
    standardText: standardText({
      standard_template: "microbial_limit_standard",
      standard_params: {},
    }),
    conclusionName: "微生物限度",
    hasNumericConclusion: false,
    layout: {
      key: `products/${productKey}/finished/microbial_limit`,
      templateId: layout.templateId,
      status: layout.status,
      sourceRef: layout.sourceRef,
      params: layout.params,
    },
    layoutBlocks,
    methodGroups: [],
  };
}

async function microbiologyLayoutAssignment(configRoot: string, productKey: string): Promise<QcTemplateLayoutAssignment | undefined> {
  const mapping = asRecord(await readJson(path.join(configRoot, "source", "table_layouts", "layout_mapping.json")).catch(() => ({})));
  const assignments = asRecord(mapping.assignments);
  const key = `products/${productKey}/finished/microbial_limit`;
  const assignment = asRecord(assignments[key]);
  const templateId = asString(assignment.template_id || assignment.templateId);
  if (!templateId) return undefined;
  return {
    key,
    templateId,
    status: asString(assignment.status, "pilot"),
    sourceRef: asString(assignment.source_ref || assignment.sourceRef) || undefined,
    params: asRecord(assignment.params),
  };
}

function nextFinishedSequence(tests: QcTemplateTestItem[]) {
  const parsed = tests
    .map((test) => test.sequence.match(/^(\d+)\.(\d+)/))
    .flatMap((match) => match ? [{ major: Number(match[1]), minor: Number(match[2]) }] : []);
  const major = parsed[0]?.major || 2;
  const minor = parsed.reduce((max, item) => Math.max(max, item.minor), 0) + 1;
  return `${major}.${minor}`;
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
  const rawProductName = asString(product.name, templateId);
  const productName = normalizeProductDisplayName(rawProductName);
  const rawStages = await Promise.all(Object.values(asRecord(product.stages)).map((stage) => toStage(source.configRoot, templateId, stage)));
  const stages = normalizeProductNameOccurrences(rawStages, rawProductName, productName) as QcTemplateStage[];
  const methodRefs = new Set(stages.flatMap((stage) => stage.tests.map((test) => test.methodFile).filter(Boolean)));

  return {
    source,
    id: templateId,
    fileName: `${templateId}.json`,
    productName,
    stages,
    methodFileCount: methodRefs.size,
    layoutAssignmentCount: stages.reduce((sum, stage) => sum + stage.tests.length, 0),
  };
}

export function normalizeProductDisplayName(value: string) {
  return value
    .replace(/([\u3400-\u9fff])\s+(肠溶片|注射液|胶囊|胶丸|颗粒|片|丸|散)/gu, "$1$2")
    .trim();
}

function normalizeProductNameOccurrences(value: unknown, rawName: string, normalizedName: string): unknown {
  if (!rawName || rawName === normalizedName) return value;
  if (typeof value === "string") return replaceProductName(value, rawName, normalizedName);
  if (Array.isArray(value)) return value.map((item) => normalizeProductNameOccurrences(item, rawName, normalizedName));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeProductNameOccurrences(item, rawName, normalizedName)]));
  }
  return value;
}

function replaceProductName(value: string, rawName: string, normalizedName: string) {
  const pattern = rawName.split(/\s+/).map(escapeRegExp).join("\\s+");
  return value.replace(new RegExp(pattern, "g"), normalizedName);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
