import type { QcLayoutBlock, QcLayoutCell } from "./types";

export function expandPrecheckLayoutBlock(block: QcLayoutBlock): QcLayoutBlock[] | null {
  if (isPrecheckFilesTable(block)) return expandPrecheckFiles(block);
  if (isPrecheckConfirmTable(block)) return expandPrecheckConfirm(block);
  return null;
}

function expandPrecheckFiles(block: QcLayoutBlock): QcLayoutBlock[] {
  const [titleRow, ...bodyRows] = block.rows || [];
  return [
    precheckTitleBlock(block, rowTitle(titleRow) || block.title || "1.1 文件", "files"),
    { ...block, label: `${block.label}:body`, rows: bodyRows },
  ];
}

function expandPrecheckConfirm(block: QcLayoutBlock): QcLayoutBlock[] {
  return (block.rows || []).flatMap((row, rowIndex) => {
    const title = rowTitle(row);
    const answerParts = row.slice(1).flatMap((cellValue) => cellValue.parts);
    if (!title || !answerParts.length) return [{ ...block, label: `${block.label}:${rowIndex}`, rows: [row] }];
    return [
      precheckTitleBlock(block, title, `confirm:${rowIndex}`),
      { ...block, type: "precheck_body", label: `${block.label}:body:${rowIndex}`, parts: answerParts, rows: undefined },
    ];
  });
}

function precheckTitleBlock(block: QcLayoutBlock, title: string, suffix: string): QcLayoutBlock {
  return { ...block, type: "precheck_title", label: `${block.label}:heading:${suffix}`, title, text: title, rows: undefined };
}

function isPrecheckFilesTable(block: QcLayoutBlock) {
  return block.type === "table" && block.label === "precheck-files" && Boolean(block.rows?.length);
}

function isPrecheckConfirmTable(block: QcLayoutBlock) {
  return block.type === "table" && block.label === "precheck-confirm" && Boolean(block.rows?.length);
}

function rowTitle(row: QcLayoutCell[] | undefined) {
  const cellValue = row?.[0];
  const text = (cellValue?.rawText || cellValue?.parts.map((part) => part.text || part.defaultValue || part.name || "").join("") || "").trim();
  return text && /^\d+\.\d+\s+/.test(text) ? text : undefined;
}
