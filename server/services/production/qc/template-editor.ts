import "server-only";
import path from "path";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { qcRuntimeDataPath } from "./runtime-data-path";
import { loadQcLayoutBlocks } from "./layout-blocks";
import { qcTemplateCategoryLabel, qcTemplateDisplayName } from "./template-editor-labels";
import { getQcTemplateDetail } from "./record-structure";
import { resolvePharmaOpsRoot } from "./source";
import type { QcLayoutBlock, QcLayoutCell, QcTemplateDetail, QcTemplateMethodField, QcTemplateMethodGroup, QcTemplateStage, QcTemplateTestItem } from "./types";
import type {
  QcTemplateEditorData,
  QcTemplateEditorDraft,
  QcTemplateEditorFieldGroup,
  QcTemplateInspectionCatalogItem,
  QcTemplateEditorNodeType,
  QcTemplateEditorPreview,
  QcTemplateEditorTarget,
  QcTemplateModuleLibraryItem,
} from "./template-editor-types";

interface DraftStore { drafts: QcTemplateEditorDraft[] }
interface DraftAuthor { userId: number; userName: string }

const FORMULA_FUNCTIONS = ["SUM", "AVG", "SUBTRACT", "DIVIDE", "ABS", "ROUND", "SD_SAMPLE", "RSD", "RD"];
const VALID_NODE_TYPES = new Set<QcTemplateEditorNodeType>(["precheck", "experiment", "test", "module"]);
const STANDARD_INSPECTION_ITEMS: Array<{
  key: string;
  label: string;
  englishName: string;
  methodName: string;
  matchKeys: string[];
  templateIds: string[];
}> = [
  { key: "appearance", label: "性状", englishName: "appearance", methodName: "目测", matchKeys: ["appearance"], templateIds: ["parents/appearance_basic"] },
  { key: "moisture", label: "水分", englishName: "moisture", methodName: "水分", matchKeys: ["moisture"], templateIds: ["parents/moisture_two_sample_full"] },
  { key: "content", label: "含量", englishName: "content", methodName: "HPLC", matchKeys: ["content"], templateIds: ["parents/hplc_content_full"] },
  { key: "identification", label: "鉴别", englishName: "identification", methodName: "鉴别", matchKeys: ["identification"], templateIds: ["parents/identification_full"] },
  { key: "related_substances", label: "有关物质", englishName: "related_substances", methodName: "HPLC", matchKeys: ["related_substances"], templateIds: ["parents/related_substances_hplc_full"] },
  { key: "dissolution", label: "溶出度", englishName: "dissolution", methodName: "溶出度", matchKeys: ["dissolution"], templateIds: ["parents/dissolution_full"] },
  { key: "content_uniformity", label: "含量均匀度", englishName: "content_uniformity", methodName: "HPLC", matchKeys: ["content_uniformity"], templateIds: ["parents/content_uniformity_hplc_full"] },
  { key: "friability", label: "脆碎度", englishName: "friability", methodName: "脆碎度", matchKeys: ["friability"], templateIds: ["parents/friability_full"] },
  { key: "disintegration", label: "崩解时限", englishName: "disintegration", methodName: "崩解时限", matchKeys: ["disintegration"], templateIds: ["parents/disintegration_full"] },
  { key: "microbial_limit", label: "微生物限度检查", englishName: "microbial_limit", methodName: "微生物", matchKeys: ["microbial_limit"], templateIds: ["parents/microbiology_limit_full"] },
  { key: "variation", label: "重量/装量差异", englishName: "weight_variation", methodName: "重量/装量差异", matchKeys: ["weight_variation", "fill_variation"], templateIds: ["parents/variation_20_full"] },
];

function dataPath() {
  return qcRuntimeDataPath("qc-template-drafts.json");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function normalizePart(value: unknown) {
  return String(value ?? "").trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
}

export function qcTemplateDraftId(target: Pick<QcTemplateEditorTarget, "productKey" | "stageKey" | "nodeType" | "testNameEn">) {
  return [target.productKey, target.stageKey, target.nodeType, target.testNameEn].map(normalizePart).filter(Boolean).join("/");
}

async function readStore(): Promise<DraftStore> {
  try {
    const raw = JSON.parse(await readFile(dataPath(), "utf8")) as Partial<DraftStore>;
    return { drafts: Array.isArray(raw.drafts) ? raw.drafts : [] };
  } catch {
    return { drafts: [] };
  }
}

async function writeStore(store: DraftStore) {
  const filePath = dataPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function firstAvailableModule(moduleLibrary: QcTemplateModuleLibraryItem[], ids: string[]) {
  return ids
    .map((id) => moduleLibrary.find((item) => item.id === id || item.templateId === id))
    .find(Boolean);
}

function targetFromDetail(detail: QcTemplateDetail, stage: QcTemplateStage, nodeType: QcTemplateEditorNodeType, test?: QcTemplateTestItem): QcTemplateEditorTarget {
  return {
    productKey: detail.id,
    productName: detail.productName,
    stageKey: stage.key,
    stageLabel: stage.label,
    nodeType,
    testNameEn: test?.englishName,
    testName: test?.name,
    sequence: test?.sequence,
  };
}

function experimentBlocks(stage: QcTemplateStage): QcLayoutBlock[] {
  const cell = (rawText: string, bold = false): QcLayoutCell => ({
    rawText,
    parts: [],
    colspan: 1,
    rowspan: 1,
    isEmpty: false,
    align: "center",
    bold,
  });
  return [{
    type: "table",
    title: "实验项目",
    sectionSuffix: "auto",
    sectionSlot: "auto",
    rows: [
      [cell("序号", true), cell("项目", true), cell("方法", true), cell("组件", true)],
      ...stage.tests.map((test) => [
        cell(test.sequence),
        cell(test.name),
        cell(test.methodName || "未配置"),
        cell(test.layout?.templateId || "未映射"),
      ]),
    ],
  }];
}

function initialDraft(detail: QcTemplateDetail, stage: QcTemplateStage, nodeType: QcTemplateEditorNodeType, test?: QcTemplateTestItem): QcTemplateEditorDraft {
  const target = targetFromDetail(detail, stage, nodeType, test);
  const blocks = nodeType === "precheck" ? stage.precheckLayoutBlocks || []
    : nodeType === "experiment" ? experimentBlocks(stage)
      : test?.layoutBlocks || [];
  return {
    ...target,
    draftId: qcTemplateDraftId(target),
    layoutDraft: { blocks: clone(blocks) },
    methodDraft: { methodGroups: clone(test?.methodGroups || []) },
    sourceTemplateId: test?.layout?.templateId,
    updatedBy: "system",
    updatedAt: new Date(0).toISOString(),
  };
}

function stageTargets(detail: QcTemplateDetail) {
  return detail.stages.flatMap((stage) => [
    initialDraft(detail, stage, "precheck"),
    initialDraft(detail, stage, "experiment"),
    ...stage.tests.map((test) => initialDraft(detail, stage, "test", test)),
  ]);
}

async function listTemplateLibrary(): Promise<QcTemplateModuleLibraryItem[]> {
  const source = await resolvePharmaOpsRoot();
  if (!source.available) return [];
  const root = path.join(source.configRoot, "table_layouts", "templates");
  const items: QcTemplateModuleLibraryItem[] = [];
  async function walk(dir: string, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
        continue;
      }
      if (!entry.name.endsWith(".json")) continue;
      const filePath = path.join(dir, entry.name);
      const data = asRecord(JSON.parse(await readFile(filePath, "utf8")));
      const id = `${prefix}${entry.name.replace(/\.json$/, "")}`;
      const templateId = asString(data.template_id, id);
      const category = asString(data.category, prefix.split("/")[0] || "custom");
      const title = asString(data.title, id);
      const blocks = await loadQcLayoutBlocks(source.configRoot, { key: id, templateId, status: asString(data.status), params: {} }).catch(() => []);
      items.push({
        id,
        templateId,
        title,
        displayName: qcTemplateDisplayName(id, title),
        category,
        categoryLabel: qcTemplateCategoryLabel(category),
        status: asString(data.status) || undefined,
        subcomponent: data.subcomponent === true,
        blocks: blocks?.length ? blocks : undefined,
      });
    }
  }
  await walk(root);
  return items.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title, "zh-Hans-CN"));
}

function fieldGroups(detail: QcTemplateDetail): QcTemplateEditorFieldGroup[] {
  const precheckFields: QcTemplateMethodField[] = detail.stages.flatMap((stage) => [
    { name: `${stage.label}-检验前确认`, fieldKey: `${stage.key}/precheck`, group: "检验前确认", type: "radio", attr: "fillable", options: ["是", "否"] },
  ]);
  const currentFields = detail.stages.flatMap((stage) => stage.tests.flatMap((test) => test.methodGroups.flatMap((group) => group.fields)));
  const layoutFields: QcTemplateMethodField[] = [
    { name: "批号", fieldKey: "batch_number", group: "布局字段", type: "text", attr: "fillable" },
    { name: "检验日期", fieldKey: "layout/common/inspection_date", group: "布局字段", type: "date", attr: "fillable" },
    { name: "完成日期", fieldKey: "layout/common/complete_date", group: "布局字段", type: "date", attr: "fillable" },
  ];
  return [
    { label: "当前检测项字段", fields: currentFields },
    { label: "检验前确认字段", fields: precheckFields },
    { label: "布局字段", fields: layoutFields },
    { label: "跨批次字段（预留）", fields: [] },
  ];
}

function inspectionCatalog(detail: QcTemplateDetail, moduleLibrary: QcTemplateModuleLibraryItem[]): QcTemplateInspectionCatalogItem[] {
  const knownKeys = new Set(STANDARD_INSPECTION_ITEMS.flatMap((item) => item.matchKeys));
  const items = STANDARD_INSPECTION_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    englishName: item.englishName,
    methodName: item.methodName,
    matchKeys: item.matchKeys,
    templates: item.templateIds
      .map((templateId) => firstAvailableModule(moduleLibrary, [templateId]))
      .filter((candidate): candidate is QcTemplateModuleLibraryItem => Boolean(candidate))
      .map((candidate) => ({
        id: candidate.id,
        displayName: candidate.displayName,
        templateId: candidate.templateId,
      })),
  })).filter((item) => item.templates.length > 0);

  const extras = new Map<string, QcTemplateInspectionCatalogItem>();
  detail.stages.forEach((stage) => {
    stage.tests.forEach((test) => {
      if (!test.englishName || knownKeys.has(test.englishName)) return;
      const template = test.layout?.templateId ? firstAvailableModule(moduleLibrary, [test.layout.templateId]) : undefined;
      extras.set(test.englishName, {
        key: normalizePart(test.englishName) || normalizePart(test.name) || `extra_${extras.size + 1}`,
        label: test.name,
        englishName: test.englishName,
        methodName: test.methodName || test.name,
        matchKeys: [test.englishName],
        templates: template ? [{
          id: template.id,
          displayName: template.displayName,
          templateId: template.templateId,
        }] : [],
      });
    });
  });

  return [...items, ...extras.values()];
}

export async function getQcTemplateEditorData(templateId: string): Promise<QcTemplateEditorData> {
  const [detail, store, moduleLibrary] = await Promise.all([getQcTemplateDetail(templateId), readStore(), listTemplateLibrary()]);
  return {
    detail,
    drafts: store.drafts.filter((draft) => draft.productKey === detail.id),
    moduleLibrary,
    inspectionCatalog: inspectionCatalog(detail, moduleLibrary),
    fieldGroups: fieldGroups(detail),
    formulaFunctions: FORMULA_FUNCTIONS,
  };
}

function allFields(groups: QcTemplateMethodGroup[]) {
  return groups.flatMap((group) => group.fields);
}

function validateBlocks(blocks: QcLayoutBlock[], groups: QcTemplateMethodGroup[], allowUnknownFields = false) {
  const errors: string[] = [];
  const fieldNames = new Set(allFields(groups).map((field) => field.name));
  const roles = new Set(blocks.map((block) => block.sectionRole).filter(Boolean));
  blocks.forEach((block, blockIndex) => {
    if (block.sectionRef && !roles.has(block.sectionRef)) errors.push(`模块 ${blockIndex + 1} 的 sectionRef 未找到锚点：${block.sectionRef}`);
    if (JSON.stringify(block).match(/\{FIELD:|[{}][a-zA-Z_][^{}]*[{}]/)) errors.push(`模块 ${blockIndex + 1} 仍包含未替换占位符`);
    block.rows?.forEach((row, rowIndex) => row.forEach((cell, cellIndex) => {
      if (cell.colspan <= 0 || cell.rowspan <= 0) errors.push(`模块 ${blockIndex + 1} 第 ${rowIndex + 1} 行第 ${cellIndex + 1} 格合并参数不合法`);
      cell.parts.forEach((part) => {
        if (part.type === "select" && !part.options?.length) errors.push(`模块 ${blockIndex + 1} 第 ${rowIndex + 1} 行第 ${cellIndex + 1} 格下拉框缺少选项`);
        if (!allowUnknownFields && (part.type === "field" || part.type === "line") && part.field && !fieldNames.has(part.field)) errors.push(`字段不存在：${part.field}`);
      });
    }));
  });
  return errors;
}

function normalizeDraft(raw: unknown, author?: DraftAuthor): QcTemplateEditorDraft {
  const draft = asRecord(raw) as unknown as QcTemplateEditorDraft;
  if (!draft.productKey || !draft.stageKey || !VALID_NODE_TYPES.has(draft.nodeType)) throw new Error("草稿目标不完整");
  const normalized: QcTemplateEditorDraft = {
    ...draft,
    draftId: draft.draftId || qcTemplateDraftId(draft),
    layoutDraft: { blocks: Array.isArray(draft.layoutDraft?.blocks) ? draft.layoutDraft.blocks : [], tests: Array.isArray(draft.layoutDraft?.tests) ? draft.layoutDraft.tests : undefined },
    methodDraft: { methodGroups: Array.isArray(draft.methodDraft?.methodGroups) ? draft.methodDraft.methodGroups : [] },
    updatedBy: author?.userName || draft.updatedBy || "unknown",
    updatedAt: new Date().toISOString(),
  };
  const errors = validateBlocks(normalized.layoutDraft.blocks, normalized.methodDraft.methodGroups, normalized.nodeType === "module");
  if (errors.length) throw new Error(errors.join("；"));
  return normalized;
}

export async function saveQcTemplateEditorDraft(raw: unknown, author: DraftAuthor) {
  const draft = normalizeDraft(raw, author);
  const store = await readStore();
  const index = store.drafts.findIndex((item) => item.draftId === draft.draftId);
  if (index >= 0) store.drafts[index] = draft;
  else store.drafts.push(draft);
  await writeStore(store);
  return draft;
}

export function previewQcTemplateEditorDraft(raw: unknown): QcTemplateEditorPreview {
  const draft = normalizeDraft(raw);
  const errors = validateBlocks(draft.layoutDraft.blocks, draft.methodDraft.methodGroups, draft.nodeType === "module");
  return {
    target: draft,
    blocks: draft.layoutDraft.blocks,
    methodGroups: draft.methodDraft.methodGroups,
    errors,
  };
}

export async function getInitialQcTemplateEditorDraft(templateId: string, draftId: string) {
  const detail = await getQcTemplateDetail(templateId);
  const existing = (await readStore()).drafts.find((draft) => draft.draftId === draftId);
  if (existing) return existing;
  return stageTargets(detail).find((draft) => draft.draftId === draftId) || null;
}
