import type {
  QcLayoutBlock,
  QcLayoutCell,
  QcLayoutPart,
  QcTemplateDetail,
  QcTemplateEditorDraft,
  QcTemplateEditorNodeType,
  QcTemplateEditorTarget,
  QcTemplateEditorTestDraft,
  QcTemplateModuleLibraryItem,
  QcTemplateStage,
  QcTemplateTestItem,
} from "@/server/services/production/qc";

export interface NewTestInput {
  name: string;
  englishName: string;
  methodName: string;
  templateId?: string;
}

export const emptyCell = (rawText = ""): QcLayoutCell => ({
  rawText,
  parts: rawText ? [{ type: "text", text: rawText }] : [],
  colspan: 1,
  rowspan: 1,
  isEmpty: false,
  align: "center",
});

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalize(value?: string) {
  return String(value || "").trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
}

export function draftId(target: Pick<QcTemplateEditorTarget, "productKey" | "stageKey" | "nodeType" | "testNameEn">) {
  return [target.productKey, target.stageKey, target.nodeType, target.testNameEn].map(normalize).filter(Boolean).join("/");
}

export function targetFromNode(detail: QcTemplateDetail, stage: QcTemplateStage, nodeType: QcTemplateEditorNodeType, test?: QcTemplateTestItem): QcTemplateEditorTarget {
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

export function orderedTestDrafts(tests: QcTemplateEditorTestDraft[]) {
  return tests
    .slice()
    .sort((a, b) => (a.order || a.defaultOrder || 0) - (b.order || b.defaultOrder || 0))
    .map((test, index) => ({ ...test, order: index + 1, sequence: `2.${index + 1}` }));
}

export function testDraftsFromStage(stage: QcTemplateStage): QcTemplateEditorTestDraft[] {
  return stage.tests.map((test, index) => ({
    id: test.englishName,
    name: test.name,
    englishName: test.englishName,
    methodName: test.methodName || "",
    templateId: test.layout?.templateId,
    defaultOrder: index + 1,
    order: index + 1,
    sequence: `2.${index + 1}`,
    source: "yaml",
  }));
}

export function experimentBlocksFromTests(tests: QcTemplateEditorTestDraft[]): QcLayoutBlock[] {
  return [{
    type: "table",
    title: "实验项目",
    sectionSuffix: "auto",
    sectionSlot: "auto",
    rows: [
      ["序号", "项目", "方法", "组件"].map((text) => ({ ...emptyCell(text), bold: true, header: true })),
      ...orderedTestDrafts(tests).map((test) => [
        emptyCell(test.sequence || `2.${test.order}`),
        emptyCell(test.name),
        emptyCell(test.methodName || "未配置"),
        emptyCell(test.templateId || "未映射"),
      ]),
    ],
  }];
}

export function initialDraft(detail: QcTemplateDetail, stage: QcTemplateStage, nodeType: QcTemplateEditorNodeType, test?: QcTemplateTestItem): QcTemplateEditorDraft {
  const target = targetFromNode(detail, stage, nodeType, test);
  const tests = testDraftsFromStage(stage);
  const blocks = nodeType === "precheck" ? stage.precheckLayoutBlocks || []
    : nodeType === "experiment" ? experimentBlocksFromTests(tests)
      : test?.layoutBlocks || [];
  return {
    ...target,
    draftId: draftId(target),
    layoutDraft: { blocks: clone(blocks), tests: nodeType === "experiment" ? tests : undefined },
    methodDraft: { methodGroups: clone(test?.methodGroups || []) },
    sourceTemplateId: test?.layout?.templateId,
    updatedBy: "system",
    updatedAt: new Date(0).toISOString(),
  };
}

export function withExperimentTests(draft: QcTemplateEditorDraft, tests: QcTemplateEditorTestDraft[]): QcTemplateEditorDraft {
  const ordered = orderedTestDrafts(tests);
  return { ...draft, layoutDraft: { ...draft.layoutDraft, tests: ordered, blocks: experimentBlocksFromTests(ordered) } };
}

export function testItemFromDraft(stage: QcTemplateStage, test: QcTemplateEditorTestDraft, library: QcTemplateModuleLibraryItem[]): QcTemplateTestItem {
  const original = stage.tests.find((item) => item.englishName === test.englishName);
  const templateItem = library.find((item) => item.id === test.templateId || item.templateId === test.templateId);
  return {
    sequence: test.sequence || `2.${test.order}`,
    name: test.name,
    englishName: test.englishName,
    methodName: test.methodName,
    standardText: original?.standardText,
    conclusionName: original?.conclusionName,
    conclusionFieldKey: original?.conclusionFieldKey,
    hasNumericConclusion: original?.hasNumericConclusion || false,
    cleanupItems: original?.cleanupItems,
    layout: test.templateId ? { key: test.templateId, templateId: test.templateId, status: test.source === "draft" ? "draft" : original?.layout?.status || "pilot", params: {} } : original?.layout,
    layoutBlocks: original?.layoutBlocks || templateItem?.blocks || [],
    methodFile: original?.methodFile,
    methodGroups: original?.methodGroups || [],
  };
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  project_header: "项目表头",
  environment_table: "实验环境",
  equipment_table: "仪器、设备",
  materials_table: "试验材料",
  reference_standard_table: "标准品",
  title: "标题",
  operation_text: "操作方法",
  paragraph: "段落",
  standard_text: "标准规定",
  attachment_upload: "原始数据上传",
  microbiology_cleanroom_exit: "洁净区退出",
  abnormal_handling: "实验结果异常处理",
  cleanup_checklist: "清场",
  conclusion: "结论",
  table: "表格",
};

export function moduleDisplayName(item: QcTemplateModuleLibraryItem) {
  return item.displayName || item.title || item.id;
}

export function moduleCategoryLabel(item: QcTemplateModuleLibraryItem) {
  return item.categoryLabel || item.category || "其他";
}

export function blockLabel(block: QcLayoutBlock, index: number) {
  return block.title || block.label || block.text || BLOCK_TYPE_LABELS[block.type] || block.type || `模块 ${index + 1}`;
}

export function encodeParts(parts: QcLayoutPart[], rawText = "") {
  if (parts.length === 0) return rawText;
  return parts.map((part) => part.type === "field" || part.type === "line"
    ? `[字段:${part.field || part.name || part.fieldKey || ""}]`
    : part.text || part.defaultValue || "").join("");
}

export function parseParts(input: string): QcLayoutPart[] {
  const parts: QcLayoutPart[] = [];
  let cursor = 0;
  for (const match of input.matchAll(/\[字段:([^\]]+)\]/g)) {
    if (match.index !== undefined && match.index > cursor) parts.push({ type: "text", text: input.slice(cursor, match.index) });
    parts.push({ type: "field", field: match[1].trim() });
    cursor = (match.index || 0) + match[0].length;
  }
  if (cursor < input.length) parts.push({ type: "text", text: input.slice(cursor) });
  return parts;
}

export function addRow(block: QcLayoutBlock) {
  const cols = Math.max(1, block.rows?.[0]?.length || 1);
  return { ...block, rows: [...(block.rows || []), Array.from({ length: cols }, () => emptyCell())] };
}

export function addColumn(block: QcLayoutBlock) {
  const rows = block.rows?.length ? block.rows : [[emptyCell()]];
  return { ...block, rows: rows.map((row) => [...row, emptyCell()]) };
}

export function simpleTable(): QcLayoutBlock {
  return {
    type: "table",
    title: "新表格",
    sectionSuffix: "auto",
    sectionSlot: "auto",
    rows: [
      [emptyCell("项目"), emptyCell("结果")],
      [emptyCell(), emptyCell()],
    ],
  };
}
