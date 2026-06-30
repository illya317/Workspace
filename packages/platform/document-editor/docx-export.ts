import type { EditorBlock, EditorDocument, EditorInline } from "./types";

type DocxModule = typeof import("docx");
type DocxChild = InstanceType<DocxModule["Paragraph"]> | InstanceType<DocxModule["Table"]>;

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
      properties: {},
      children: document.blocks.map((block) => blockToDocx(docx, block, values)),
    }],
  });
}

function blockToDocx(docx: DocxModule, block: EditorBlock, values: Record<string, unknown>): DocxChild {
  if (block.type === "table") {
    return new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      layout: docx.TableLayoutType.FIXED,
      rows: block.rows.map((row) => new docx.TableRow({
        children: row.cells.map((cell) => new docx.TableCell({
          columnSpan: cell.colspan && cell.colspan > 1 ? cell.colspan : undefined,
          rowSpan: cell.rowspan && cell.rowspan > 1 ? cell.rowspan : undefined,
          width: typeof cell.width === "number" ? { size: cell.width, type: docx.WidthType.DXA } : undefined,
          shading: cell.header ? { fill: "F1F5F9" } : undefined,
          borders: tableBorders(docx),
          margins: { top: 80, right: 100, bottom: 80, left: 100 },
          children: [new docx.Paragraph({ children: cell.parts.flatMap((part) => inlineToRuns(docx, part, values)) })],
        })),
      })),
    });
  }

  return new docx.Paragraph({
    heading: block.type === "heading" ? headingLevel(docx, block.level) : undefined,
    spacing: { after: block.type === "heading" ? 180 : 80 },
    children: block.type === "heading"
      ? [new docx.TextRun({ text: block.text, bold: block.bold ?? true })]
      : block.type === "paragraph"
        ? block.parts.flatMap((part) => inlineToRuns(docx, part, values))
        : [new docx.TextRun({ text: `${block.title}：${block.text}` })],
  });
}

function inlineToRuns(docx: DocxModule, part: EditorInline, values: Record<string, unknown>) {
  if (part.type === "text") {
    return [new docx.TextRun({
      text: part.text,
      bold: part.bold ?? part.marks?.bold,
      italics: part.marks?.italic,
      underline: part.marks?.underline ? { type: docx.UnderlineType.SINGLE } : undefined,
    })];
  }

  const value = part.fieldKey ? values[part.fieldKey] : undefined;
  const text = value == null || value === "" ? slotFallbackText(part) : String(value);
  const underlined = part.type === "dateSlot"
    || part.type === "signatureSlot"
    || part.display !== "plain";

  return [
    new docx.TextRun({ text: " " }),
    new docx.TextRun({
      text: `${text}${part.unit ? ` ${part.unit}` : ""}`,
      bold: part.type === "formulaSlot",
      underline: underlined ? { type: docx.UnderlineType.SINGLE } : undefined,
    }),
    new docx.TextRun({ text: " " }),
  ];
}

function slotFallbackText(part: Exclude<EditorInline, { type: "text" }>) {
  if (part.type === "formulaSlot" && (part.formula || part.formulaText)) return `${part.label ?? part.fieldKey ?? "公式"} = ${part.formula ?? part.formulaText}`;
  if (part.type === "dateSlot") return part.label ?? "日期";
  if (part.type === "signatureSlot") return part.label ?? "签名";
  return part.label ?? part.fieldKey ?? "____";
}

function headingLevel(docx: DocxModule, level: 1 | 2 | 3 | 4) {
  if (level === 1) return docx.HeadingLevel.HEADING_1;
  if (level === 2) return docx.HeadingLevel.HEADING_2;
  return docx.HeadingLevel.HEADING_3;
}

function tableBorders(docx: DocxModule) {
  return {
    top: { style: docx.BorderStyle.SINGLE, size: 1, color: "444444" },
    bottom: { style: docx.BorderStyle.SINGLE, size: 1, color: "444444" },
    left: { style: docx.BorderStyle.SINGLE, size: 1, color: "444444" },
    right: { style: docx.BorderStyle.SINGLE, size: 1, color: "444444" },
  };
}
