import type {
  QcLayoutBlock,
  QcLayoutCell,
  QcLayoutPart,
  QcTemplateDetail,
  QcTemplateEditorDraft,
  QcTemplateEditorNodeType,
  QcTemplateEditorTarget,
  QcTemplateStage,
  QcTemplateTestItem,
} from "@/server/services/production/qc";

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

function experimentBlocks(stage: QcTemplateStage): QcLayoutBlock[] {
  return [{
    type: "table",
    title: "实验项目",
    sectionSuffix: "auto",
    sectionSlot: "auto",
    rows: [
      ["序号", "项目", "方法", "组件"].map((text) => ({ ...emptyCell(text), bold: true, header: true })),
      ...stage.tests.map((test) => [
        emptyCell(test.sequence),
        emptyCell(test.name),
        emptyCell(test.methodName || "未配置"),
        emptyCell(test.layout?.templateId || "未映射"),
      ]),
    ],
  }];
}

export function initialDraft(detail: QcTemplateDetail, stage: QcTemplateStage, nodeType: QcTemplateEditorNodeType, test?: QcTemplateTestItem): QcTemplateEditorDraft {
  const target = targetFromNode(detail, stage, nodeType, test);
  const blocks = nodeType === "precheck" ? stage.precheckLayoutBlocks || []
    : nodeType === "experiment" ? experimentBlocks(stage)
      : test?.layoutBlocks || [];
  return {
    ...target,
    draftId: draftId(target),
    layoutDraft: { blocks: clone(blocks) },
    methodDraft: { methodGroups: clone(test?.methodGroups || []) },
    sourceTemplateId: test?.layout?.templateId,
    updatedBy: "system",
    updatedAt: new Date(0).toISOString(),
  };
}

export function blockLabel(block: QcLayoutBlock, index: number) {
  return block.title || block.label || block.text || (block.type === "table" ? "表格" : block.type) || `模块 ${index + 1}`;
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
