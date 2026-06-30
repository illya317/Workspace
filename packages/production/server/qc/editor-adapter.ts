import type {
  QcLayoutBlock,
  QcLayoutCell,
  QcLayoutPart,
  QcTemplateMethodField,
  QcTemplateStage,
  QcTemplateTestItem,
} from "./types";
import {
  buildAudit,
  countEditorDocument,
  countEnhancedQc,
  countLegacyDetail,
  editorDocumentToEnhancedQc,
} from "./editor-adapter-audit";
import {
  cleanupRows,
  conclusionParts,
  environmentRows,
  equipmentRows,
  verificationRows,
  textParts,
} from "./editor-adapter-layout";
import { normalizeLegacyInput } from "./editor-adapter-normalize";
import { expandPrecheckLayoutBlock } from "./editor-adapter-precheck";
import { annotateEditorSlots } from "./editor-adapter-slots";
import type {
  EditorBlock,
  EditorDocument,
  EditorFieldDefinition,
  EditorFieldModel,
  EditorFormulaDefinition,
  EditorHeadingBlock,
  EditorInlinePart,
  EditorParagraphBlock,
  EditorTableBlock,
  EditorTableCell,
  JsonObject,
  LegacyQcInput,
  QcEditorConversionResult,
} from "./editor-adapter-types";

export type * from "./editor-adapter-types";
export { countEditorDocument, editorDocumentToEnhancedQc } from "./editor-adapter-audit";

interface ConversionContext {
  productKey: string;
  productName: string;
  stage?: QcTemplateStage;
  test?: QcTemplateTestItem;
  blockIndex: number;
  fieldModel: EditorFieldModel;
}

interface FieldResolver {
  byKey: Map<string, QcTemplateMethodField>;
  byName: Map<string, QcTemplateMethodField[]>;
}

const CHINESE_ORDER = ["一", "二", "三", "四", "五", "六"];
const DEFAULT_UNDERLINE_WIDTH = "3rem";

export function legacyQcToEditorDocument(legacy: LegacyQcInput): QcEditorConversionResult {
  const detail = normalizeLegacyInput(legacy);
  const fieldModel = createFieldModel();
  const blocks: EditorBlock[] = [];

  detail.stages.forEach((stage, stageIndex) => {
    blocks.push(headingBlock(
      `${detail.id}:${stage.key}:heading`,
      1,
      `${CHINESE_ORDER[stageIndex] || stageIndex + 1}、${detail.productName}${stage.label}`,
      { qcRole: "stageHeading", productKey: detail.id, stageKey: stage.key, stageLabel: stage.label },
    ));
    blocks.push(headingBlock(
      `${detail.id}:${stage.key}:precheck-heading`,
      2,
      "1 检验前准备",
      { qcRole: "precheckSectionHeading", productKey: detail.id, stageKey: stage.key },
    ));

    appendBlocks(blocks, stage.precheckLayoutBlocks || [], {
      productKey: detail.id,
      productName: detail.productName,
      stage,
      blockIndex: 0,
      fieldModel,
    });
    appendBlocks(blocks, stage.experimentLayoutBlocks || [], {
      productKey: detail.id,
      productName: detail.productName,
      stage,
      blockIndex: blocks.length,
      fieldModel,
    });

    stage.tests.forEach((test) => {
      blocks.push(headingBlock(
        `${detail.id}:${stage.key}:${test.englishName}:heading`,
        3,
        `${test.sequence} ${test.name}`,
        { qcRole: "testHeading", productKey: detail.id, stageKey: stage.key, testKey: test.englishName, sequence: test.sequence },
      ));
      registerMethodFields(fieldModel, test, {
        productKey: detail.id,
        productName: detail.productName,
        stage,
        test,
        blockIndex: blocks.length,
        fieldModel,
      });
      appendBlocks(blocks, test.layoutBlocks || [], {
        productKey: detail.id,
        productName: detail.productName,
        stage,
        test,
        blockIndex: blocks.length,
        fieldModel,
      });
    });
  });
  annotateEditorSlots(blocks, fieldModel);

  const document: EditorDocument = {
    schemaVersion: 1,
    kind: "qc-editor-document",
    id: `qc-editor:${detail.id}`,
    title: `批检验记录：${detail.productName}`,
    blocks,
    metadata: {
      source: "legacy-qc",
      productKey: detail.id,
      productName: detail.productName,
      fileName: detail.fileName,
      stageOrder: detail.stages.map((stage) => stage.key),
    },
  };
  const enhanced = editorDocumentToEnhancedQc(document, fieldModel);
  const legacyCounts = countLegacyDetail(detail, fieldModel);
  const editorCounts = countEditorDocument(document, fieldModel);
  const enhancedCounts = countEnhancedQc(enhanced);
  const audit = buildAudit(legacyCounts, editorCounts, enhancedCounts);
  return { document, fieldModel, audit };
}

function createFieldModel(): EditorFieldModel {
  return { schemaVersion: 1, fields: {}, formulas: {} };
}

function appendBlocks(target: EditorBlock[], sourceBlocks: QcLayoutBlock[], context: ConversionContext) {
  sourceBlocks.forEach((block, index) => {
    const blockContext = { ...context, blockIndex: context.blockIndex + index };
    for (const editorBlock of convertLayoutBlock(block, blockContext)) {
      target.push(editorBlock);
    }
  });
}

function convertLayoutBlock(block: QcLayoutBlock, context: ConversionContext): EditorBlock[] {
  const metadata = blockMetadata(block, context);
  const precheckBlocks = expandPrecheckLayoutBlock(block);
  if (precheckBlocks) return precheckBlocks.flatMap((item, index) => convertLayoutBlock(item, { ...context, blockIndex: context.blockIndex + index }));
  if (block.type === "table" && block.rows?.length) return [tableBlockFromRows(block, block.rows, metadata, context)];
  if (block.type === "environment_table") return [tableBlockFromRows(block, environmentRows(block), metadata, context)];
  if (block.type === "equipment_table") return [tableBlockFromRows(block, equipmentRows(block), metadata, context)];
  if (block.type === "materials_table") return [tableBlockFromRows(block, verificationRows(block, block.materials || [], "试验材料", block.fieldPrefix || "layout/common/materials"), metadata, context)];
  if (block.type === "reference_standard_table") return [tableBlockFromRows(block, verificationRows(block, block.standards || [], "标准品", block.fieldPrefix || "layout/common/reference_standards"), metadata, context)];
  if (block.type === "precheck_title") return [headingBlock(blockId(context, block, "title"), 3, block.title || block.text || "", { ...metadata, qcRole: "precheckHeading" })];
  if (block.type === "precheck_body") return [paragraphBlock(blockId(context, block, "body"), block.parts || [], { ...metadata, qcRole: "precheckBody" }, context)];
  if (block.type === "title") return [headingBlock(blockId(context, block, "title"), context.test ? 4 : 2, layoutTitleText(block), metadata)];
  if (block.type === "operation_text" || block.type === "paragraph") {
    return [paragraphBlock(blockId(context, block, "paragraph"), block.parts || textParts(block.text), metadata, context)];
  }
  if (block.type === "standard_text") {
    return postSectionBlocks(block, "标准规定", textParts(context.test?.standardText || block.text || "YAML 未配置标准规定"), metadata, context);
  }
  if (block.type === "abnormal_handling") {
    const prefix = block.fieldPrefix || "layout/abnormal";
    const title = "实验结果异常处理";
    const postSectionMetadata = { ...metadata, qcRole: "postSectionBody", postSectionTitle: title };
    const codeMetadata = { ...postSectionMetadata, qcRole: "abnormalCode" };
    return [headingBlock(blockId(context, block, `${title}:heading`), 4, title, { ...metadata, qcRole: "postSectionHeading" }), paragraphBlock(blockId(context, block, `${title}:occurred`), [{ type: "radio", fieldKey: `${prefix}/occurred`, options: ["是", "否"] }], postSectionMetadata, context), paragraphBlock(blockId(context, block, `${title}:code`), [{ type: "text", text: "实验室异常情况编号 " }, { type: "line", fieldKey: `${prefix}/code`, width: DEFAULT_UNDERLINE_WIDTH, underline: true }], codeMetadata, context)];
  }
  if (block.type === "cleanup_checklist") {
    return [tableBlockFromRows(block, cleanupRows(block, context.test), metadata, context)];
  }
  if (block.type === "conclusion") {
    return postSectionBlocks(block, "结论", conclusionParts(block, context.test), metadata, context);
  }
  if (block.type === "attachment_upload") {
    return [{
      id: blockId(context, block, "attachment"),
      type: "attachment",
      title: "原始数据",
      text: block.text || "原始数据、图谱、待包装品检验报告单见数据图谱粘贴页。",
      fieldKey: block.fieldKey || "layout/raw_data/attachments",
      metadata,
    }];
  }
  if (block.type === "microbiology_cleanroom_exit") {
    return postSectionBlocks(block, "退出", [
      { type: "text", text: block.text || "人员、物品退出洁净区按《实验室洁净区进出标准操作规程》进行。" },
      { type: "radio", fieldKey: block.fieldKey || "layout/microbiology/cleanroom_exit_confirmed", options: ["是", "否"] },
    ], metadata, context);
  }
  if (block.rows?.length) return [tableBlockFromRows(block, block.rows, metadata, context)];
  if (block.parts?.length) return [paragraphBlock(blockId(context, block, "parts"), block.parts, metadata, context)];
  if (block.title || block.text || block.label) {
    return [paragraphBlock(blockId(context, block, "text"), textParts(block.text || block.title || block.label || ""), metadata, context)];
  }
  return [];
}

function registerMethodFields(fieldModel: EditorFieldModel, test: QcTemplateTestItem, context: ConversionContext) {
  const fields = test.methodGroups.flatMap((group) => group.fields);
  for (const field of fields) {
    const fieldKey = field.fieldKey;
    if (!fieldKey) continue;
    upsertField(fieldModel, fieldKey, {
      fieldKey,
      name: field.name,
      group: field.group,
      valueType: field.type,
      inputType: field.type,
      attr: field.attr,
      unit: field.unit,
      options: field.options,
      defaultValue: field.defaultValue,
      recommendedValue: field.recommendedValue,
      readonlyDisplay: field.attr === "calculated",
      referenceFieldKey: configuredReferenceKey(field),
      valueSource: configuredValueSource(field),
      source: sourceContext(context),
      metadata: { legacyMethodField: field },
    });
    if (field.formula || field.rule || field.attr === "calculated") {
      upsertFormula(fieldModel, fieldKey, {
        fieldKey,
        formulaText: field.formula,
        rule: field.rule,
        dependencyFieldKeys: methodFieldDependencies(field, fields),
        referenceFieldKey: configuredReferenceKey(field),
        readonlyDisplay: field.attr === "calculated",
        source: sourceContext(context),
        metadata: { legacyMethodField: field },
      });
    }
  }
}

function tableBlockFromRows(block: QcLayoutBlock, rows: QcLayoutCell[][], metadata: JsonObject, context: ConversionContext): EditorTableBlock {
  return {
    id: blockId(context, block, "table"),
    type: "table",
    title: block.title,
    label: block.label,
    rows: rows.map((row, rowIndex) => ({
      height: block.rowHeights?.[rowIndex],
      cells: row.map((cell) => cellToEditorCell(cell, context)),
    })),
    columnWidths: block.columnWidths,
    metadata,
  };
}

function cellToEditorCell(cell: QcLayoutCell, context: ConversionContext): EditorTableCell {
  const parts = cell.parts.length ? cell.parts.flatMap((part) => partToEditorParts(part, context)) : textParts(cell.rawText).flatMap((part) => partToEditorParts(part, context));
  return {
    rawText: cell.rawText || undefined,
    parts,
    colspan: cell.colspan || 1,
    rowspan: cell.rowspan || 1,
    isEmpty: cell.isEmpty,
    header: cell.header,
    align: cell.align,
    bold: cell.bold,
    width: cell.width,
    className: cell.className,
    metadata: { legacyCell: cell },
  };
}

function paragraphBlock(id: string, parts: QcLayoutPart[], metadata: JsonObject, context: ConversionContext): EditorParagraphBlock {
  return {
    id,
    type: "paragraph",
    parts: parts.flatMap((part) => partToEditorParts(part, context)),
    metadata,
  };
}

function headingBlock(id: string, level: 1 | 2 | 3 | 4, text: string, metadata: JsonObject): EditorHeadingBlock {
  return { id: makeId(id), type: "heading", level, text, bold: true, metadata };
}

function postSectionBlocks(block: QcLayoutBlock, title: string, parts: QcLayoutPart[], metadata: JsonObject, context: ConversionContext): EditorBlock[] {
  return [
    headingBlock(blockId(context, block, `${title}:heading`), 4, title, { ...metadata, qcRole: "postSectionHeading" }),
    paragraphBlock(blockId(context, block, `${title}:body`), parts, { ...metadata, qcRole: "postSectionBody", postSectionTitle: title }, context),
  ];
}

function layoutTitleText(block: QcLayoutBlock) {
  const title = block.title || block.text || "操作方法";
  const suffix = block.sectionSuffix?.trim();
  if (!suffix || suffix === "auto" || title.startsWith(`${suffix} `) || title.startsWith(`${suffix}.`)) return title;
  return `${suffix} ${title}`;
}

function partToEditorParts(part: QcLayoutPart, context: ConversionContext): EditorInlinePart[] {
  if (part.type === "br") return [{ type: "text", text: "\n", metadata: { legacyPart: part } }];
  if (part.type === "text" || part.type === "hint" || part.type === "note") return [{ type: "text", text: part.text || "", metadata: { legacyPart: part } }];
  if (part.type === "param") return [{ type: "text", text: part.defaultValue || part.name || "", metadata: { legacyPart: part } }];
  if (part.type === "section_heading") return [{ type: "text", text: part.text || "", metadata: { legacyPart: part } }];
  if (part.type === "test_value") return [{ type: "text", text: testValue(part, context.test), metadata: { legacyPart: part } }];

  const resolver = fieldResolver(context.test);
  const fieldKey = resolvePartFieldKey(part, resolver);
  const field = resolver.byKey.get(fieldKey);
  const commonMetadata = { legacyPart: part, legacyMethodField: field, source: sourceContext(context) };
  if (fieldKey) {
    registerFieldSlot(context.fieldModel, fieldKey, part, field, context);
  }

  if (part.type === "date") {
    return [{
      type: "dateSlot",
      fieldKey: fieldKey || "date",
      withTime: part.withTime,
      defaultValue: part.defaultValue,
      defaultOffsetDays: part.defaultOffsetDays,
      readonlyDisplay: part.readonlyDisplay,
      metadata: commonMetadata,
    }];
  }

  if (isSignatureField(fieldKey)) {
    return [{
      type: "signatureSlot",
      fieldKey,
      role: signatureRole(fieldKey),
      readonlyDisplay: part.readonlyDisplay,
      referenceFieldKey: configuredReferenceKey(part) || configuredReferenceKey(field),
      valueSource: configuredValueSource(part) || configuredValueSource(field),
      width: DEFAULT_UNDERLINE_WIDTH,
      metadata: commonMetadata,
    }];
  }

  const formulaText = part.advancedFormulaText || field?.formula || field?.rule;
  const isReference = !!(configuredReferenceKey(part) || configuredReferenceKey(field) || configuredValueSource(part) || configuredValueSource(field));
  const hasFormulaMetadata = !!(
    formulaText
    || part.advancedFormulaTextMap
    || part.advancedDependencyFieldKeys?.length
    || part.advancedDependencyFieldKeyMap
    || part.type === "duration_days"
    || part.type === "duration_hours"
    || part.type === "microbial_selected_total"
    || field?.attr === "calculated"
  );
  if (fieldKey && (hasFormulaMetadata || isReference || part.readonlyDisplay)) {
    upsertFormula(context.fieldModel, fieldKey, {
      fieldKey,
      formulaText: formulaText || durationFormulaText(part),
      rule: field?.rule,
      dependencyFieldKeys: explicitPartDependencies(part),
      referenceFieldKey: configuredReferenceKey(part) || configuredReferenceKey(field),
      readonlyDisplay: part.readonlyDisplay || field?.attr === "calculated",
      source: sourceContext(context),
      metadata: commonMetadata,
    });
    return [{
      type: "formulaSlot",
      fieldKey,
      label: field?.name || part.field || part.name,
      formulaText: formulaText || durationFormulaText(part),
      formulaTextMap: part.advancedFormulaTextMap,
      dependencyFieldKeys: explicitPartDependencies(part),
      dependencyFieldKeyMap: part.advancedDependencyFieldKeyMap,
      slotKind: isReference ? "reference" : "formula",
      readonlyDisplay: part.readonlyDisplay || field?.attr === "calculated",
      referenceFieldKey: configuredReferenceKey(part) || configuredReferenceKey(field),
      valueSource: configuredValueSource(part) || configuredValueSource(field),
      width: DEFAULT_UNDERLINE_WIDTH,
      metadata: commonMetadata,
    }];
  }

  return [{
    type: "fieldSlot",
    fieldKey: fieldKey || part.field || part.name || "field",
    label: field?.name || part.field || part.name,
    inputType: part.type === "line" ? part.inputType || field?.type || "text" : part.type,
    options: part.options?.length ? part.options : field?.options,
    defaultValue: part.defaultValue || field?.defaultValue,
    placeholder: part.placeholder,
    readonlyDisplay: part.readonlyDisplay,
    width: DEFAULT_UNDERLINE_WIDTH,
    metadata: commonMetadata,
  }];
}

function registerFieldSlot(fieldModel: EditorFieldModel, fieldKey: string, part: QcLayoutPart, field: QcTemplateMethodField | undefined, context: ConversionContext) {
  upsertField(fieldModel, fieldKey, {
    fieldKey,
    name: field?.name || part.field || part.name,
    group: field?.group,
    valueType: field?.type || part.inputType || part.type,
    inputType: part.type === "line" ? part.inputType || field?.type || "text" : part.type,
    attr: field?.attr,
    unit: field?.unit,
    options: part.options?.length ? part.options : field?.options,
    defaultValue: part.defaultValue || field?.defaultValue,
    recommendedValue: field?.recommendedValue,
    readonlyDisplay: part.readonlyDisplay || field?.attr === "calculated",
    referenceFieldKey: configuredReferenceKey(part) || configuredReferenceKey(field),
    valueSource: configuredValueSource(part) || configuredValueSource(field),
    source: sourceContext(context),
    metadata: { legacyPart: part, legacyMethodField: field },
  });
}

function upsertField(fieldModel: EditorFieldModel, fieldKey: string, next: EditorFieldDefinition) {
  fieldModel.fields[fieldKey] = { ...next, ...fieldModel.fields[fieldKey], ...defined(next) };
}

function upsertFormula(fieldModel: EditorFieldModel, fieldKey: string, next: EditorFormulaDefinition) {
  const previous = fieldModel.formulas[fieldKey];
  fieldModel.formulas[fieldKey] = previous
    ? { ...previous, ...defined(next), dependencyFieldKeys: unique([...(previous.dependencyFieldKeys || []), ...(next.dependencyFieldKeys || [])]) }
    : { ...next, dependencyFieldKeys: unique(next.dependencyFieldKeys || []) };
}

function blockMetadata(block: QcLayoutBlock, context: ConversionContext): JsonObject {
  return {
    legacyBlock: block,
    legacyType: block.type,
    legacyLabel: block.label,
    productKey: context.productKey,
    productName: context.productName,
    stageKey: context.stage?.key,
    stageLabel: context.stage?.label,
    testKey: context.test?.englishName,
    testName: context.test?.name,
    sequence: context.test?.sequence,
    source: sourceContext(context),
  };
}

function sourceContext(context: ConversionContext): JsonObject {
  return {
    productKey: context.productKey,
    productName: context.productName,
    stageKey: context.stage?.key,
    stageLabel: context.stage?.label,
    testKey: context.test?.englishName,
    testName: context.test?.name,
    sequence: context.test?.sequence,
  };
}

function blockId(context: ConversionContext, block: QcLayoutBlock, suffix: string) {
  return makeId(["qc", context.productKey, context.stage?.key, context.test?.englishName, block.label || block.type, context.blockIndex, suffix].filter(Boolean).join(":"));
}

function makeId(value: string) {
  return value.replace(/\s+/g, "_").replace(/[^\w:/.-]+/g, "_");
}

function fieldResolver(test?: QcTemplateTestItem): FieldResolver {
  const byKey = new Map<string, QcTemplateMethodField>();
  const byName = new Map<string, QcTemplateMethodField[]>();
  for (const field of test?.methodGroups.flatMap((group) => group.fields) || []) {
    if (field.fieldKey) byKey.set(field.fieldKey, field);
    if (field.name) {
      const list = byName.get(field.name) || [];
      list.push(field);
      byName.set(field.name, list);
    }
  }
  return { byKey, byName };
}

function resolvePartFieldKey(part: QcLayoutPart, resolver: FieldResolver) {
  if (part.fieldKey) return part.fieldKey;
  if (part.field) {
    const matches = resolver.byName.get(part.field) || [];
    const field = matches[Math.max(1, part.occurrence || 1) - 1] || matches[0];
    if (field?.fieldKey) return field.fieldKey;
  }
  return part.field || part.name || "";
}

function methodFieldDependencies(field: QcTemplateMethodField, fields: QcTemplateMethodField[]) {
  const expr = `${field.formula || ""} ${field.rule || ""}`;
  const prefix = scopePrefix(field.fieldKey);
  return fields.filter((candidate) => (
    candidate.fieldKey !== field.fieldKey && candidate.fieldKey.startsWith(prefix) && candidate.name && expr.includes(candidate.name)
  )).map((candidate) => candidate.fieldKey).filter(Boolean);
}

function explicitPartDependencies(part: QcLayoutPart) {
  return unique([...(part.advancedDependencyFieldKeys || []), ...(part.startKey ? [part.startKey] : []), ...(part.endKey ? [part.endKey] : []), ...Object.values(part.advancedDependencyFieldKeyMap || {}).flat()]);
}

function durationFormulaText(part: QcLayoutPart) {
  if (part.type === "duration_days" && part.startKey && part.endKey) return `${part.endKey} - ${part.startKey}（天）`;
  if (part.type === "duration_hours" && part.startKey && part.endKey) return `${part.endKey} - ${part.startKey}（小时）`;
  return undefined;
}

function configuredReferenceKey(value?: QcLayoutPart | QcTemplateMethodField) {
  if (!value) return undefined;
  return value.referenceFieldKey || value.reference_field_key || value.valueSource?.fieldKey || value.valueSource?.field_key || value.value_source?.fieldKey || value.value_source?.field_key;
}

function configuredValueSource(value?: QcLayoutPart | QcTemplateMethodField): JsonObject | undefined {
  return value?.valueSource || value?.value_source;
}

function isSignatureField(fieldKey: string) {
  return /\/signature\/(inspector|reviewer|signature)$/.test(fieldKey);
}

function signatureRole(fieldKey: string): "inspector" | "reviewer" | "signature" {
  if (fieldKey.endsWith("/inspector")) return "inspector";
  if (fieldKey.endsWith("/reviewer")) return "reviewer";
  return "signature";
}

function testValue(part: QcLayoutPart, test?: QcTemplateTestItem) {
  const valuePath = part.path || part.field || "";
  return ({ standard: test?.standardText, name: test?.name, method: test?.methodName }[valuePath] || part.defaultValue || part.text || "");
}

function scopePrefix(fieldKey: string) {
  const parts = fieldKey.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}/` : "";
}

function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }

function defined<T extends object>(value: T): Partial<T> { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>; }
