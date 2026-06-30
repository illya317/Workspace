import type {
  EditorBlock,
  EditorDocument,
  EditorInline,
  EditorTableBlock,
  EditorTableCell,
  EditorTableRow,
} from "@workspace/platform/document-editor";

export function normalizePrecheckHeadings(document: EditorDocument): EditorDocument {
  const sourceBlocks = document.blocks.filter((block) => !isQcProductTitle(document, block));
  const expandedBlocks = sourceBlocks.flatMap((block) => {
    if (block.type !== "table") return [block];
    if (isPrecheckFilesTable(block)) return normalizePrecheckFilesTable(block);
    if (isPrecheckConfirmTable(block)) return normalizePrecheckConfirmTable(block);
    return [block];
  });
  return { ...document, blocks: insertMissingSectionHeadings(expandedBlocks.flatMap(splitAbnormalCodeParagraph)) };
}

function insertMissingSectionHeadings(blocks: EditorBlock[]): EditorBlock[] {
  const next: EditorBlock[] = [];
  let stageId = "";
  let hasPrecheckHeading = false;
  let hasExperimentHeading = false;

  blocks.forEach((block) => {
    if (isStageHeading(block)) {
      stageId = block.id;
      hasPrecheckHeading = false;
      hasExperimentHeading = false;
      next.push(block);
      return;
    }
    if (stageId && !hasPrecheckHeading && isPrecheckStart(block)) {
      next.push(sectionHeading(`${stageId}:precheck-section`, "1 检验前准备", "precheckSectionHeading"));
      hasPrecheckHeading = true;
    }
    if (stageId && !hasExperimentHeading && isExperimentStart(block)) {
      next.push(sectionHeading(`${stageId}:experiment-section`, "2 实验项目", "experimentSectionHeading"));
      hasExperimentHeading = true;
    }
    if (isPrecheckSectionHeading(block)) hasPrecheckHeading = true;
    if (isExperimentSectionHeading(block)) hasExperimentHeading = true;
    next.push(block);
  });
  return next;
}

function normalizePrecheckFilesTable(block: EditorTableBlock): EditorBlock[] {
  const title = cellText(block.rows[0]?.cells[0]);
  if (!/^1\.1\s+/.test(title)) return [block];
  const rows = block.rows.slice(1);
  if (!rows.length) return [createPrecheckHeading(block, "precheck-files-heading", title)];
  return [
    createPrecheckHeading(block, "precheck-files-heading", title),
    {
      ...block,
      label: "precheck-files:body",
      rows,
      metadata: {
        ...block.metadata,
        precheckNormalizedFrom: "precheck-files",
      },
    },
  ];
}

function normalizePrecheckConfirmTable(block: EditorTableBlock): EditorBlock[] {
  const next: EditorBlock[] = [];
  const remainingRows: EditorTableRow[] = [];
  block.rows.forEach((row, rowIndex) => {
    const title = cellText(row.cells[0]);
    if (!/^1\.[2-4]\s+/.test(title)) {
      remainingRows.push(row);
      return;
    }
    next.push(createPrecheckHeading(block, `precheck-confirm-${rowIndex}-heading`, title));
    next.push({
      id: `${block.id}:precheck-confirm-${rowIndex}-body`,
      type: "paragraph",
      parts: cellsToParts(row.cells.slice(1)),
      metadata: {
        ...block.metadata,
        precheckNormalizedFrom: "precheck-confirm",
        sourceRowId: row.id,
      },
    });
  });
  if (remainingRows.length) next.push({ ...block, rows: remainingRows });
  return next.length ? next : [block];
}

function isPrecheckFilesTable(block: EditorTableBlock) {
  return tableLabel(block) === "precheck-files" && Boolean(block.rows.length);
}

function isPrecheckConfirmTable(block: EditorTableBlock) {
  return tableLabel(block) === "precheck-confirm" && Boolean(block.rows.length);
}

function tableLabel(block: EditorTableBlock) {
  if (block.label) return block.label;
  const legacyBlock = block.metadata?.legacyBlock;
  if (legacyBlock && typeof legacyBlock === "object" && "label" in legacyBlock) {
    const label = (legacyBlock as { label?: unknown }).label;
    return typeof label === "string" ? label : undefined;
  }
  return undefined;
}

function createPrecheckHeading(block: EditorTableBlock, suffix: string, text: string): EditorBlock {
  return {
    id: `${block.id}:${suffix}`,
    type: "heading",
    level: 3,
    text,
    bold: true,
    metadata: {
      ...block.metadata,
      precheckNormalizedFrom: tableLabel(block),
    },
  };
}

function sectionHeading(id: string, text: string, qcRole: string): EditorBlock {
  return {
    id,
    type: "heading",
    level: 2,
    text,
    bold: true,
    metadata: { qcRole, normalized: true },
  };
}

function isStageHeading(block: EditorBlock) {
  return block.type === "heading" && (
    block.metadata?.qcRole === "stageHeading"
    || /^[一二三四五六七八九十]+、/.test(block.text)
  );
}

function isQcProductTitle(document: EditorDocument, block: EditorBlock) {
  return document.kind === "qc-editor-document"
    && block.type === "heading"
    && (block.metadata?.qcRole === "productTitle" || /^批检验记录：/.test(block.text));
}

function isPrecheckStart(block: EditorBlock) {
  return isStageHeaderTable(block) || isPrecheckHeading(block);
}

function isExperimentStart(block: EditorBlock) {
  return block.type === "heading" && /^2\.1\s+/.test(block.text);
}

function isStageHeaderTable(block: EditorBlock) {
  return block.type === "table" && tableLabel(block) === "stage_header";
}

function isPrecheckHeading(block: EditorBlock) {
  return block.type === "heading" && /^1\.1\s+/.test(block.text);
}

function isPrecheckSectionHeading(block: EditorBlock) {
  return block.type === "heading" && block.text.trim() === "1 检验前准备";
}

function isExperimentSectionHeading(block: EditorBlock) {
  return block.type === "heading" && block.text.trim() === "2 实验项目";
}

function splitAbnormalCodeParagraph(block: EditorBlock): EditorBlock[] {
  if (block.type !== "paragraph") return [block];
  const codeIndex = block.parts.findIndex((part) => part.type === "text" && part.text.includes("实验室异常情况编号"));
  if (codeIndex <= 0) return [block];
  return [
    { ...block, id: `${block.id}:occurred`, parts: block.parts.slice(0, codeIndex) },
    { ...block, id: `${block.id}:code`, parts: block.parts.slice(codeIndex), metadata: { ...block.metadata, qcRole: "abnormalCode" } },
  ];
}

function cellsToParts(cells: EditorTableCell[]): EditorInline[] {
  const parts = cells.flatMap((cell) => cell.parts?.length ? cell.parts : textToParts(cell.rawText));
  return parts.length ? parts : [{ type: "text", text: "" }];
}

function textToParts(text: string | undefined): EditorInline[] {
  const value = text?.trim();
  return value ? [{ type: "text", text: value }] : [];
}

function cellText(cell: EditorTableCell | undefined) {
  if (!cell) return "";
  const raw = cell.rawText?.trim();
  if (raw) return raw;
  return (cell.parts ?? []).map(partText).join("").trim();
}

function partText(part: EditorInline) {
  if (part.type === "text") return part.text;
  return part.label ?? part.placeholder ?? part.fieldKey;
}
