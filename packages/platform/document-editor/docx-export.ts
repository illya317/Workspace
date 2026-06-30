import type { EditorBlock, EditorDocument, EditorInline } from "./types";

type DocxModule = typeof import("docx");
type DocxChild = InstanceType<DocxModule["Paragraph"]> | InstanceType<DocxModule["Table"]>;

const A4_WIDTH_DXA = 11906;
const A4_HEIGHT_DXA = 16838;
const PAGE_MARGIN_X_DXA = 907;
const PAGE_MARGIN_Y_DXA = 850;
const PAGE_CONTENT_WIDTH_DXA = A4_WIDTH_DXA - PAGE_MARGIN_X_DXA * 2;
const BODY_SIZE = 21;
const PAPER_FONT = { ascii: "FangSong", hAnsi: "FangSong", eastAsia: "仿宋" } as const;

export async function exportEditorDocumentToDocxBuffer(
  document: EditorDocument,
  values: Record<string, unknown> = {},
): Promise<Buffer> {
  const docx = await import("docx");
  const doc = buildDocxDocument(docx, document, values);
  return docx.Packer.toBuffer(doc);
}

export async function exportEditorDocumentToDocxBlob(
  document: EditorDocument,
  values: Record<string, unknown> = {},
): Promise<Blob> {
  const docx = await import("docx");
  const doc = buildDocxDocument(docx, document, values);
  return docx.Packer.toBlob(doc);
}

function buildDocxDocument(docx: DocxModule, document: EditorDocument, values: Record<string, unknown>) {
  return new docx.Document({
    title: document.title,
    sections: [{
      properties: {
        page: {
          size: {
            width: A4_WIDTH_DXA,
            height: A4_HEIGHT_DXA,
            orientation: docx.PageOrientation.PORTRAIT,
          },
          margin: {
            top: PAGE_MARGIN_Y_DXA,
            right: PAGE_MARGIN_X_DXA,
            bottom: PAGE_MARGIN_Y_DXA,
            left: PAGE_MARGIN_X_DXA,
          },
        },
      },
      children: document.blocks.flatMap((block, index) => blockToDocx(docx, block, values, index, document.blocks)),
    }],
  });
}

function blockToDocx(
  docx: DocxModule,
  block: EditorBlock,
  values: Record<string, unknown>,
  index: number,
  blocks: EditorBlock[],
): DocxChild[] {
  if (block.type === "pageBreak") {
    return [new docx.Paragraph({ children: [new docx.PageBreak()] })];
  }
  if (block.type === "table") {
    const columnWidths = tableColumnWidths(block);
    const table = new docx.Table({
      width: { size: PAGE_CONTENT_WIDTH_DXA, type: docx.WidthType.DXA },
      columnWidths,
      layout: docx.TableLayoutType.FIXED,
      rows: block.rows.map((row) => new docx.TableRow({
        cantSplit: false,
        children: row.cells.map((cell, cellIndex) => new docx.TableCell({
          columnSpan: cell.colspan && cell.colspan > 1 ? cell.colspan : undefined,
          rowSpan: cell.rowspan && cell.rowspan > 1 ? cell.rowspan : undefined,
          width: { size: cellWidthDxa(columnWidths, row.cells, cellIndex), type: docx.WidthType.DXA },
          verticalAlign: docx.VerticalAlign.CENTER,
          borders: tableBorders(docx),
          margins: { top: 100, right: 120, bottom: 100, left: 120 },
          children: [new docx.Paragraph({
            alignment: docx.AlignmentType.CENTER,
            spacing: { before: 0, after: 0, line: 260 },
            children: cell.parts.flatMap((part) => inlineToRuns(docx, part, values)),
          })],
        })),
      })),
    });
    return shouldAddTableSpacer(index, blocks) ? [table, spacerParagraph(docx, 120)] : [table];
  }

  return [new docx.Paragraph({
    heading: block.type === "heading" ? headingLevel(docx, block.level) : undefined,
    alignment: paragraphAlignment(docx, block),
    spacing: { before: block.type === "heading" ? 90 : 0, after: block.type === "heading" ? 120 : 80, line: 300 },
    children: block.type === "heading"
      ? [new docx.TextRun({ text: block.text, bold: block.bold ?? true, size: headingSize(block.level), color: "0F172A", font: PAPER_FONT })]
      : block.type === "paragraph"
        ? block.parts.flatMap((part) => inlineToRuns(docx, part, values))
        : [new docx.TextRun({ text: `${block.title}：${block.text}`, size: BODY_SIZE, font: PAPER_FONT })],
  })];
}

function paragraphAlignment(docx: DocxModule, block: EditorBlock) {
  if (block.type === "heading" && (block.level === 1 || block.metadata?.qcRole === "stageHeading")) return docx.AlignmentType.CENTER;
  if (block.type === "paragraph" && block.metadata?.qcRole === "abnormalCode") return docx.AlignmentType.LEFT;
  return undefined;
}

function inlineToRuns(docx: DocxModule, part: EditorInline, values: Record<string, unknown>) {
  if (part.type === "text") {
    return [new docx.TextRun({
      text: part.text,
      bold: part.bold ?? part.marks?.bold,
      italics: part.marks?.italic,
      size: BODY_SIZE,
      font: PAPER_FONT,
      underline: part.marks?.underline ? { type: docx.UnderlineType.SINGLE } : undefined,
    })];
  }
  if (isChoiceSlot(part)) {
    const value = part.fieldKey ? exportValue(values[part.fieldKey]) : undefined;
    return [new docx.TextRun({
      text: part.options.map((option) => `${choiceMark(value, option)}${option}`).join("    "),
      size: BODY_SIZE,
      font: PAPER_FONT,
    })];
  }

  const value = part.fieldKey ? exportValue(values[part.fieldKey]) : undefined;
  const hasValue = value !== null && value !== undefined && value !== "";
  const text = hasValue ? String(value) : slotBlankText(part);
  const underlined = part.type === "dateSlot"
    || part.type === "signatureSlot"
    || part.display !== "plain";

  return [
    new docx.TextRun({ text: " " }),
    new docx.TextRun({
      text,
      bold: part.type === "formulaSlot",
      size: BODY_SIZE,
      font: PAPER_FONT,
      underline: underlined ? { type: docx.UnderlineType.SINGLE } : undefined,
    }),
    new docx.TextRun({ text: " " }),
  ];
}

function isChoiceSlot(part: Exclude<EditorInline, { type: "text" }>): part is Exclude<EditorInline, { type: "text" }> & { options: string[] } {
  return part.type === "fieldSlot"
    && (part.inputType === "radio" || part.inputType === "checkbox")
    && Array.isArray(part.options)
    && part.options.length > 0;
}

function choiceMark(value: unknown, option: string) {
  const selected = Array.isArray(value)
    ? value.map(String).includes(option)
    : value != null && String(value) === option;
  return selected ? "☑" : "□";
}

function exportValue(value: unknown) {
  return value === "#ERROR" ? undefined : value;
}

function slotBlankText(part: Exclude<EditorInline, { type: "text" }>) {
  if (part.display === "plain") return "";
  const width = typeof part.width === "number" ? part.width : parseCssWidth(part.width);
  const count = Math.max(4, Math.min(24, Math.round((width ?? 48) / 12)));
  return "\u00A0".repeat(count);
}

function parseCssWidth(value: string | undefined) {
  if (!value) return undefined;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return undefined;
  if (value.endsWith("rem")) return numeric * 16;
  if (value.endsWith("em")) return numeric * 14;
  return numeric;
}

function headingSize(level: 1 | 2 | 3 | 4) {
  if (level === 1) return 30;
  if (level === 2) return 26;
  return 23;
}

function headingLevel(docx: DocxModule, level: 1 | 2 | 3 | 4) {
  if (level === 1) return docx.HeadingLevel.HEADING_1;
  if (level === 2) return docx.HeadingLevel.HEADING_2;
  if (level === 3) return docx.HeadingLevel.HEADING_3;
  return docx.HeadingLevel.HEADING_4;
}

function tableColumnWidths(block: Extract<EditorBlock, { type: "table" }>) {
  const count = Math.max(1, ...block.rows.map((row) => row.cells.reduce((sum, cell) => sum + (cell.colspan ?? 1), 0)));
  const explicit = block.columnWidths?.map(cssWidthToDxa).filter((width): width is number => Boolean(width && width > 0));
  if (explicit?.length === count) return normalizeWidths(explicit, PAGE_CONTENT_WIDTH_DXA);
  const resized = resizedColumnWidths(block, count);
  if (resized) return normalizeWidths(resized, PAGE_CONTENT_WIDTH_DXA);
  return Array.from({ length: count }, () => Math.floor(PAGE_CONTENT_WIDTH_DXA / count));
}

function resizedColumnWidths(block: Extract<EditorBlock, { type: "table" }>, count: number) {
  const widths = Array.from({ length: count }, () => 0);
  for (const row of block.rows) {
    let gridIndex = 0;
    for (const cell of row.cells) {
      const span = cell.colspan ?? 1;
      const width = typeof cell.width === "number" ? cell.width * 15 : typeof cell.width === "string" ? cssWidthToDxa(cell.width) : undefined;
      if (width && span === 1) widths[gridIndex] = Math.max(widths[gridIndex], width);
      gridIndex += span;
    }
  }
  return widths.every((width) => width > 0) ? widths : null;
}

function cellWidthDxa(widths: number[], cells: unknown[], cellIndex: number) {
  let gridIndex = 0;
  for (let index = 0; index < cellIndex; index += 1) {
    const cell = cells[index] as { colspan?: number };
    gridIndex += cell.colspan ?? 1;
  }
  const cell = cells[cellIndex] as { colspan?: number };
  const span = cell.colspan ?? 1;
  return widths.slice(gridIndex, gridIndex + span).reduce((sum, width) => sum + width, 0);
}

function cssWidthToDxa(value: string) {
  if (value.endsWith("%")) return Math.round((Number.parseFloat(value) / 100) * PAGE_CONTENT_WIDTH_DXA);
  const px = parseCssWidth(value);
  return px ? Math.round(px * 15) : undefined;
}

function normalizeWidths(widths: number[], target: number) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (!total) return widths;
  return widths.map((width) => Math.max(120, Math.round((width / total) * target)));
}

function shouldAddTableSpacer(index: number, blocks: EditorBlock[]) {
  const next = blocks[index + 1];
  return Boolean(next && next.type === "table");
}

function spacerParagraph(docx: DocxModule, after: number) {
  return new docx.Paragraph({ spacing: { before: 0, after }, children: [new docx.TextRun({ text: "" })] });
}

function tableBorders(docx: DocxModule) {
  return {
    top: { style: docx.BorderStyle.SINGLE, size: 1, color: "444444" },
    bottom: { style: docx.BorderStyle.SINGLE, size: 1, color: "444444" },
    left: { style: docx.BorderStyle.SINGLE, size: 1, color: "444444" },
    right: { style: docx.BorderStyle.SINGLE, size: 1, color: "444444" },
  };
}
