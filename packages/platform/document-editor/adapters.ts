import type {
  EditorBlock,
  EditorDocument,
  EditorInline,
  EditorSlotInline,
  EditorTableCell,
  EditorTableRow,
} from "./types";

type TiptapNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string }>;
  content?: TiptapNode[];
};

const deprecatedFormulaKindKey = ["formula", "Kind"].join("");

export function createEmptyEditorDocument(title = "未命名模板"): EditorDocument {
  return {
    schemaVersion: 1,
    kind: "editor-document",
    id: createId("editor-document"),
    title,
    blocks: [
      { id: createId("heading"), type: "heading", level: 1, text: title },
      { id: createId("paragraph"), type: "paragraph", parts: [] },
    ],
    metadata: {},
  };
}

export function editorDocumentToTiptapJson(document: EditorDocument): TiptapNode {
  return {
    type: "doc",
    content: document.blocks.map(blockToTiptapNode),
  };
}

export function tiptapJsonToEditorDocument(json: unknown, previous?: EditorDocument): EditorDocument {
  const node = isTiptapNode(json) ? json : { type: "doc", content: [] };
  return {
    schemaVersion: 1,
    kind: previous?.kind ?? "editor-document",
    id: previous?.id ?? createId("editor-document"),
    title: previous?.title ?? "未命名模板",
    metadata: previous?.metadata,
    blocks: (node.content ?? []).map(tiptapNodeToBlock).filter((block): block is EditorBlock => Boolean(block)),
  };
}

function blockToTiptapNode(block: EditorBlock): TiptapNode {
  if (block.type === "heading") {
    return {
      type: "heading",
      attrs: { id: block.id, level: normalizeTiptapHeadingLevel(block.level), metadata: block.metadata, textAlign: headingTextAlign(block) },
      content: textToTiptapContent(block.text, block.bold),
    };
  }
  if (block.type === "paragraph") {
    return {
      type: "paragraph",
      attrs: { id: block.id, metadata: block.metadata, textAlign: paragraphTextAlign(block) },
      content: inlinePartsToTiptapContent(block.parts),
    };
  }
  if (block.type === "attachment") {
    return {
      type: "paragraph",
      attrs: { id: block.id, metadata: block.metadata, attachment: true, fieldKey: block.fieldKey },
      content: textToTiptapContent(`${block.title}：${block.text}`),
    };
  }
  if (block.type === "pageBreak") {
    return {
      type: "pageBreak",
      attrs: { id: block.id, metadata: block.metadata },
    };
  }
  return {
    type: "table",
    attrs: { id: block.id, title: block.title, label: block.label, columnWidths: block.columnWidths, metadata: block.metadata },
    content: block.rows.map(rowToTiptapNode),
  };
}

function rowToTiptapNode(row: EditorTableRow): TiptapNode {
  return {
    type: "tableRow",
    attrs: { id: row.id ?? createId("row"), height: row.height },
    content: row.cells.map(cellToTiptapNode),
  };
}

function cellToTiptapNode(cell: EditorTableCell): TiptapNode {
  return {
    type: cell.header ? "tableHeader" : "tableCell",
    attrs: {
      id: cell.id ?? createId("cell"),
      colspan: cell.colspan ?? 1,
      rowspan: cell.rowspan ?? 1,
      colwidth: typeof cell.width === "number" ? [cell.width] : null,
      rawText: cell.rawText,
      align: cell.align,
      bold: cell.bold,
      width: cell.width,
      className: cell.className,
      metadata: cell.metadata,
    },
    content: [{
      type: "paragraph",
      attrs: { id: `${cell.id ?? createId("cell")}-p` },
      content: inlinePartsToTiptapContent(cell.parts),
    }],
  };
}

function headingTextAlign(block: Extract<EditorBlock, { type: "heading" }>) {
  return block.level === 1 || block.metadata?.qcRole === "stageHeading" ? "center" : undefined;
}

function paragraphTextAlign(block: Extract<EditorBlock, { type: "paragraph" }>) {
  return block.metadata?.qcRole === "abnormalCode" ? "left" : undefined;
}

function inlinePartsToTiptapContent(parts: EditorInline[]): TiptapNode[] {
  return parts.map(inlineToTiptapNode).filter((node): node is TiptapNode => Boolean(node));
}

function inlineToTiptapNode(part: EditorInline): TiptapNode | null {
  if (part.type === "text") {
    if (!part.text) return null;
    return {
      type: "text",
      text: part.text,
      marks: Object.entries({ ...part.marks, bold: part.bold ?? part.marks?.bold })
        .filter(([, enabled]) => enabled)
        .map(([type]) => ({ type })),
    };
  }
  const attrs = slotAttrs(part);
  return {
    type: part.type,
    attrs,
  };
}

function tiptapNodeToBlock(node: TiptapNode): EditorBlock | null {
  if (node.type === "heading") {
    return {
      id: stringAttr(node, "id", createId("heading")),
      type: "heading",
      level: normalizeHeadingLevel(node.attrs?.level),
      text: tiptapText(node.content),
      metadata: recordAttr(node, "metadata"),
    };
  }
  if (node.type === "paragraph") {
    const attachment = node.attrs?.attachment === true;
    if (attachment) {
      return {
        id: stringAttr(node, "id", createId("attachment")),
        type: "attachment",
        title: "原始数据",
        text: tiptapText(node.content),
        fieldKey: stringAttr(node, "fieldKey", "attachment"),
        metadata: recordAttr(node, "metadata"),
      };
    }
    return {
      id: stringAttr(node, "id", createId("paragraph")),
      type: "paragraph",
      parts: tiptapContentToInline(node.content),
      metadata: recordAttr(node, "metadata"),
    };
  }
  if (node.type === "table") {
    return {
      id: stringAttr(node, "id", createId("table")),
      type: "table",
      title: stringValue(node.attrs?.title),
      label: stringValue(node.attrs?.label),
      columnWidths: Array.isArray(node.attrs?.columnWidths) ? node.attrs?.columnWidths.map(String) : undefined,
      metadata: recordAttr(node, "metadata"),
      rows: (node.content ?? []).filter((child) => child.type === "tableRow").map(tiptapNodeToRow),
    };
  }
  if (node.type === "pageBreak") {
    return {
      id: stringAttr(node, "id", createId("page-break")),
      type: "pageBreak",
      metadata: recordAttr(node, "metadata"),
    };
  }
  return null;
}

function tiptapNodeToRow(node: TiptapNode): EditorTableRow {
  return {
    id: stringAttr(node, "id", createId("row")),
    height: stringValue(node.attrs?.height),
    cells: (node.content ?? [])
      .filter((child) => child.type === "tableCell" || child.type === "tableHeader")
      .map(tiptapNodeToCell),
  };
}

function tiptapNodeToCell(node: TiptapNode): EditorTableCell {
  const paragraph = (node.content ?? []).find((child) => child.type === "paragraph");
  const colwidth = Array.isArray(node.attrs?.colwidth) ? node.attrs?.colwidth[0] : undefined;
  return {
    id: stringAttr(node, "id", createId("cell")),
    header: node.type === "tableHeader",
    colspan: numberAttr(node, "colspan", 1),
    rowspan: numberAttr(node, "rowspan", 1),
    rawText: stringValue(node.attrs?.rawText),
    align: stringValue(node.attrs?.align),
    bold: node.attrs?.bold === true,
    width: typeof colwidth === "number" ? colwidth : stringValue(node.attrs?.width),
    className: stringValue(node.attrs?.className),
    metadata: recordAttr(node, "metadata"),
    parts: tiptapContentToInline(paragraph?.content),
  };
}

function tiptapContentToInline(content?: TiptapNode[]): EditorInline[] {
  return (content ?? []).map(tiptapNodeToInline).filter((part): part is EditorInline => Boolean(part));
}

function tiptapNodeToInline(node: TiptapNode): EditorInline | null {
  if (node.type === "text") {
    return {
      type: "text",
      text: node.text ?? "",
      marks: Object.fromEntries((node.marks ?? []).map((mark) => [mark.type, true])),
    };
  }
  if (isSlotNode(node.type)) {
    const attrs = node.attrs ?? {};
    return {
      type: node.type,
      id: stringValue(attrs.id),
      fieldKey: stringValue(attrs.fieldKey) ?? stringValue(attrs.id) ?? createId(node.type),
      label: stringValue(attrs.label),
      alias: stringValue(attrs.alias),
      slotKind: normalizedSlotKind(node.type, attrs),
      unit: stringValue(attrs.unit),
      width: typeof attrs.width === "number" ? attrs.width : stringValue(attrs.width),
      align: stringValue(attrs.align) ?? "left",
      display: attrs.display === "box" || attrs.display === "plain" ? attrs.display : "underline",
      formula: stringValue(attrs.formula),
      formulaText: stringValue(attrs.formulaText),
      formulaTextMap: isRecord(attrs.formulaTextMap) ? attrs.formulaTextMap as Record<string, string> : undefined,
      dependencyFieldKeys: Array.isArray(attrs.dependencyFieldKeys) ? attrs.dependencyFieldKeys.map(String) : undefined,
      dependencyFieldKeyMap: recordOfStringArrays(attrs.dependencyFieldKeyMap),
      readonlyDisplay: attrs.readonlyDisplay === true,
      referenceFieldKey: stringValue(attrs.referenceFieldKey),
      valueSource: isRecord(attrs.valueSource) ? attrs.valueSource : undefined,
      withTime: attrs.withTime === true,
      defaultValue: stringValue(attrs.defaultValue),
      role: attrs.role === "inspector" || attrs.role === "reviewer" ? attrs.role : "signature",
      inputType: stringValue(attrs.inputType),
      valueType: stringValue(attrs.valueType),
      numberFormat: stringValue(attrs.numberFormat),
      precision: numberValue(attrs.precision),
      options: Array.isArray(attrs.options) ? attrs.options.map(String) : undefined,
      placeholder: stringValue(attrs.placeholder),
      metadata: recordAttr(node, "metadata"),
    } satisfies EditorSlotInline;
  }
  return null;
}

function slotAttrs(part: Exclude<EditorInline, { type: "text" }>) {
  const attrs = { ...part } as Record<string, unknown>;
  delete attrs.type;
  delete attrs[deprecatedFormulaKindKey];
  if (attrs.referenceFieldKey) attrs.slotKind = "reference";
  if (!attrs.slotKind && part.type === "formulaSlot") attrs.slotKind = "formula";
  return attrs;
}

function textToTiptapContent(text: string, bold?: boolean): TiptapNode[] {
  return text ? [{ type: "text", text, marks: bold ? [{ type: "bold" }] : undefined }] : [];
}

function tiptapText(content?: TiptapNode[]) {
  return (content ?? []).map((node) => node.text ?? "").join("");
}

function isSlotNode(type: string): type is EditorSlotInline["type"] {
  return type === "fieldSlot" || type === "formulaSlot" || type === "dateSlot" || type === "signatureSlot";
}

function isTiptapNode(value: unknown): value is TiptapNode {
  return Boolean(value && typeof value === "object" && "type" in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function stringAttr(node: TiptapNode, key: string, fallback: string) {
  return typeof node.attrs?.[key] === "string" ? node.attrs[key] : fallback;
}

function numberAttr(node: TiptapNode, key: string, fallback: number) {
  return typeof node.attrs?.[key] === "number" ? node.attrs[key] : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function recordAttr(node: TiptapNode, key: string) {
  const value = node.attrs?.[key];
  return isRecord(value) ? value : undefined;
}

function recordOfStringArrays(value: unknown) {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Array.isArray(item) ? item.map(String) : []]));
}

function slotKindValue(value: unknown): EditorSlotInline["slotKind"] {
  return value === "person" || value === "date" || value === "choice" || value === "plain" || value === "variable" || value === "parameter" || value === "formula" || value === "reference" ? value : undefined;
}

function normalizedSlotKind(type: string, attrs: Record<string, unknown>): EditorSlotInline["slotKind"] {
  if (stringValue(attrs.referenceFieldKey)) return "reference";
  return slotKindValue(attrs.slotKind) ?? (type === "formulaSlot" ? "formula" : undefined);
}

function normalizeHeadingLevel(value: unknown): 1 | 2 | 3 | 4 {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : 2;
}

function normalizeTiptapHeadingLevel(value: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  return value;
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
